from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import AsyncIterator

from agent.decide import decide_and_question
from agent.events import make_event
from agent.extract import extract_from_image
from agent.normalize import normalize_extraction
from agent.schemas import AgentContext, AgentEvent, DocumentRef
from agent.tools import (
    check_duplicate,
    classify_category_and_tax,
    compare_price_history,
    lookup_tax_code_warning,
    validate_totals,
)
from agent.voice import extract_from_voice


async def process_document(
    doc: DocumentRef,
    ctx: AgentContext,
) -> AsyncIterator[AgentEvent]:
    """Full multimodal Gemini Agent pipeline yielding step-by-step Vietnamese AgentEvents."""
    seq = 1
    kind_label = {
        "image": "ảnh hóa đơn / chứng từ",
        "transfer": "ảnh chụp màn hình chuyển khoản",
        "audio": "ghi âm giọng nói tiếng Việt",
    }.get(doc.kind, "chứng từ")

    yield make_event(
        seq=seq,
        step="receive",
        status="ok",
        message=f"Keiki đã nhận {kind_label} và bắt đầu xử lý.",
    )
    seq += 1
    await asyncio.sleep(0.15)

    # Step 2: Quality check
    if len(doc.data) < 16 and not doc.preset_hint:
        yield make_event(
            seq=seq,
            step="quality_check",
            status="error",
            message="Tệp chứng từ quá nhỏ hoặc bị lỗi. Anh/chị vui lòng chụp hoặc ghi âm lại nhé.",
            data={"code": "IMAGE_QUALITY"},
        )
        return

    yield make_event(
        seq=seq,
        step="quality_check",
        status="ok",
        message=f"Kiểm tra chất lượng {kind_label} đạt yêu cầu.",
    )
    seq += 1
    await asyncio.sleep(0.15)

    # Step 3: Multimodal extraction via Google Gemini
    yield make_event(
        seq=seq,
        step="extract",
        status="running",
        message=(
            "Google Gemini Audio đang nghe và trích xuất nội dung giao dịch..."
            if doc.kind == "audio"
            else "Google Gemini Vision đang đọc thông tin trên chứng từ..."
        ),
    )
    seq += 1
    await asyncio.sleep(0.25)

    try:
        if doc.kind == "audio":
            raw_ext = await extract_from_voice(doc, ctx.settings)
        else:
            raw_ext = await extract_from_image(doc, ctx.settings)
    except Exception:
        yield make_event(
            seq=seq,
            step="error",
            status="error",
            message="Không thể đọc chứng từ tự động. Đã chuyển vào danh sách cần kiểm tra.",
            data={"code": "EXTRACT_ERROR"},
        )
        return

    amount_preview = f"{(raw_ext.amount_vnd or 0):,}".replace(",", ".")
    yield make_event(
        seq=seq,
        step="extract",
        status="ok",
        message=(
            f"Đã nghe: \"{raw_ext.transcript}\" → Số tiền {amount_preview} đ."
            if raw_ext.transcript
            else f"Đã đọc: {raw_ext.counterparty or 'Giao dịch'} — Tổng tiền {amount_preview} đ."
        ),
    )
    seq += 1
    await asyncio.sleep(0.15)

    # Step 4: Normalize currency, dates & tax category
    ext = normalize_extraction(raw_ext)
    category, tax_group = classify_category_and_tax(ext)
    ext = ext.model_copy(update={"category": category, "tax_group": tax_group})

    tax_group_labels = {
        "phan_phoi_hang_hoa": "Phân phối, cung cấp hàng hóa (1,5%)",
        "san_xuat_van_tai_an_uong": "Sản xuất, vận tải, F&B (4,5%)",
        "dich_vu_xay_dung": "Dịch vụ, thương mại (7%)",
        "kinh_doanh_khac": "Hoạt động kinh doanh khác (3%)",
        "khong_tinh_thue": "Chi phí sản xuất kinh doanh (S3-HKD)",
    }
    yield make_event(
        seq=seq,
        step="normalize",
        status="ok",
        message=f"Chuẩn hóa ngày {ext.date}, phân loại: {tax_group_labels.get(tax_group, tax_group)}.",
    )
    seq += 1
    await asyncio.sleep(0.15)

    # Step 5: Deterministic Audit Tools (Totals, Cross-Modal Duplicates, Historical Price, Tax Code)
    warnings = []
    warnings.extend(
        validate_totals(
            ext,
            tolerance_pct=ctx.settings.total_tolerance_pct,
            tolerance_min_vnd=ctx.settings.total_tolerance_min_vnd,
        )
    )
    dup_warnings, duplicate_of_id = await check_duplicate(
        ext=ext,
        repo=ctx.repo,
        household_id=ctx.household_id,
        sha256=doc.sha256,
        doc_kind=doc.kind,
    )
    warnings.extend(dup_warnings)
    warnings.extend(
        await compare_price_history(
            ext=ext,
            repo=ctx.repo,
            household_id=ctx.household_id,
            threshold=ctx.settings.price_anomaly_threshold,
        )
    )
    warnings.extend(await lookup_tax_code_warning(ext=ext, repo=ctx.repo))

    if warnings:
        for w in warnings:
            yield make_event(
                seq=seq,
                step="validate",
                status="warn",
                message=w.message,
                data={"warning_code": w.code, "duplicate_of_id": duplicate_of_id},
            )
            seq += 1
            await asyncio.sleep(0.15)
    else:
        yield make_event(
            seq=seq,
            step="validate",
            status="ok",
            message="Đối chiếu tổng tiền, lịch sử giá và kiểm tra trùng lặp đều hợp lệ.",
        )
        seq += 1
        await asyncio.sleep(0.15)

    # Step 6: Decide & Proactive Clarification Question
    decision, final_warnings, clarification_question = decide_and_question(
        ext=ext,
        warnings=warnings,
        confidence_threshold=ctx.settings.confidence_threshold,
    )

    if decision == "recorded":
        yield make_event(
            seq=seq,
            step="decide",
            status="ok",
            message="Độ tin cậy cao & không có bất thường → Tự động ghi vào sổ kế toán!",
            data={"decision": "recorded"},
        )
    else:
        yield make_event(
            seq=seq,
            step="decide",
            status="warn",
            message=clarification_question or "Cần xác nhận lại thông tin trước khi ghi sổ.",
            data={"decision": "needs_review", "clarification_question": clarification_question},
        )
    seq += 1

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tx_draft = {
        "household_id": ctx.household_id,
        "document_id": doc.document_id,
        "linked_document_ids": [doc.document_id] if doc.document_id else [],
        "duplicate_of_id": duplicate_of_id,
        "date": ext.date or "2026-11-12",
        "type": ext.type or "expense",
        "category": ext.category,
        "tax_group": ext.tax_group or "khong_tinh_thue",
        "payment_method": ext.payment_method,
        "amount_vnd": ext.amount_vnd or 1000,
        "counterparty": ext.counterparty,
        "tax_code": ext.tax_code,
        "items": [i.model_dump() for i in ext.items],
        "transcript": ext.transcript,
        "confidence": ext.confidence.model_dump(),
        "status": decision,
        "clarification_question": clarification_question,
        "warnings": [w.model_dump() for w in final_warnings],
        "source": "agent",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    yield make_event(
        seq=seq,
        step="done",
        status="ok" if decision == "recorded" else "warn",
        message=(
            "Đã hoàn tất và đóng dấu ĐÃ GHI SỔ."
            if decision == "recorded"
            else "Đã chuyển vào mục Cần hỏi lại để xác nhận."
        ),
        data={
            "transaction": tx_draft,
            "decision": decision,
            "clarification_question": clarification_question,
        },
    )
