from __future__ import annotations

from agent.normalize import normalize_text
from agent.schemas import ExtractionResult, Repository, Warning


async def check_duplicate(
    ext: ExtractionResult,
    repo: Repository,
    household_id: str,
    sha256: str | None = None,
    doc_kind: str = "image",
) -> tuple[list[Warning], str | None]:
    """Detect exact duplicates (DUPLICATE) and cross-modal duplicates between paper receipt and bank transfer (CROSS_DUPLICATE)."""
    if not ext.date or not ext.amount_vnd:
        return [], None

    cp_norm = normalize_text(ext.counterparty)
    matches = await repo.find_duplicates(
        household_id=household_id,
        counterparty_norm=cp_norm or None,
        date=ext.date,
        amount_vnd=ext.amount_vnd,
        sha256=sha256,
        doc_kind=doc_kind,
    )

    if not matches:
        return [], None

    orig = matches[0]
    amount_fmt = f"{ext.amount_vnd:,}".replace(",", ".")

    # Cross-modal duplicate: e.g. transfer screenshot matching an existing paper receipt (or vice versa)
    is_cross_modal = (
        (doc_kind == "transfer" and orig.payment_method != "transfer_only")
        or (doc_kind == "image" and orig.payment_method == "transfer")
        or (doc_kind == "audio" and orig.document_id is not None)
    )

    if is_cross_modal and doc_kind == "transfer":
        return [
            Warning(
                code="CROSS_DUPLICATE",
                severity="high",
                message=(
                    f"Phát hiện ảnh chuyển khoản {amount_fmt} đ trùng khớp với hóa đơn giấy "
                    f"'{orig.counterparty or 'cùng ngày'}' ({orig.date}). Có thể đây là thanh toán cho hóa đơn đó."
                ),
            )
        ], orig.id

    if is_cross_modal and doc_kind == "image" and orig.payment_method == "transfer":
        return [
            Warning(
                code="CROSS_DUPLICATE",
                severity="high",
                message=(
                    f"Hóa đơn giấy {amount_fmt} đ này trùng khớp với giao dịch chuyển khoản "
                    f"'{orig.counterparty or 'cùng ngày'}' ({orig.date}). Gợi ý gộp làm một giao dịch."
                ),
            )
        ], orig.id

    return [
        Warning(
            code="DUPLICATE",
            severity="high",
            message=(
                f"Chứng từ {amount_fmt} đ ngày {ext.date} tại '{orig.counterparty or 'đối tác này'}' "
                f"đã được ghi sổ trước đó (Mã: {orig.id})."
            ),
        )
    ], orig.id
