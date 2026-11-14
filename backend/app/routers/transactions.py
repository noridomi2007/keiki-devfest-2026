from __future__ import annotations

from typing import Any
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, Response

from agent.schemas import AuditLogEntry, ExtractionResult, Transaction
from agent.tools.category import classify_category_and_tax
from backend.app.errors import ApiError
from backend.app.models import (
    ConfirmRequest,
    RejectRequest,
    TransactionCreateRequest,
    TransactionListResponse,
    TransactionPatchRequest,
)
from backend.app.repositories.memory import repo
from backend.app.security import require_session

router = APIRouter(
    prefix="/api/transactions",
    tags=["transactions"],
    dependencies=[Depends(require_session)],
)


def _get_owned_transaction(tx_id: str, household_id: str) -> Transaction:
    tx = repo.get_transaction(tx_id)
    if not tx or tx.household_id != household_id:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Không tìm thấy giao dịch.")
    return tx


def _ensure_period_unlocked(household_id: str, date_str: str) -> None:
    if repo.is_period_locked(household_id, date_str):
        month_label = date_str[:7] if len(date_str) >= 7 else date_str
        raise ApiError(
            status_code=409,
            code="PERIOD_LOCKED",
            message=f"Kỳ sổ tháng {month_label} đã được chốt khóa. Vui lòng mở khóa kỳ sổ tại trang Báo cáo nếu cần điều chỉnh.",
        )


def _append_audit(
    tx: Transaction,
    action: str,
    actor: str,
    summary: str,
    timestamp: str,
) -> list[AuditLogEntry]:
    entries = list(tx.audit_log)
    entries.append(
        AuditLogEntry(
            timestamp=timestamp,
            action=action,  # type: ignore[arg-type]
            actor=actor or "Chủ hộ",
            summary=summary,
        )
    )
    return entries


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    status: str | None = Query(None),
    type: str | None = Query(None),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    session: dict[str, Any] = Depends(require_session),
) -> TransactionListResponse:
    hid = str(session.get("hid", "demo"))
    items = repo.list_transactions(
        household_id=hid,
        status=status,
        tx_type=type,
        date_from=from_date,
        date_to=to_date,
    )
    return TransactionListResponse(items=items, total=len(items))


@router.post("", response_model=Transaction, status_code=201)
async def create_manual_transaction(
    payload: TransactionCreateRequest,
    session: dict[str, Any] = Depends(require_session),
) -> Transaction:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    _ensure_period_unlocked(hid, payload.date)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ext_tmp = ExtractionResult(
        date=payload.date,
        type=payload.type,
        category=payload.category,
        tax_group=payload.tax_group,
        amount_vnd=payload.amount_vnd,
        counterparty=payload.counterparty,
        items=payload.items,
    )
    cat, tax_grp = classify_category_and_tax(ext_tmp)
    amt_str = f"{payload.amount_vnd:,}".replace(",", ".") + " đ"
    tx = Transaction(
        id=f"txn_{uuid.uuid4().hex[:8]}",
        household_id=hid,
        document_id=None,
        linked_document_ids=[],
        duplicate_of_id=None,
        date=payload.date,
        type=payload.type,
        category=payload.category or cat,
        tax_group=payload.tax_group or tax_grp,
        payment_method=payload.payment_method,
        amount_vnd=payload.amount_vnd,
        counterparty=payload.counterparty,
        tax_code=payload.tax_code,
        items=payload.items,
        transcript=None,
        confidence={},
        status="recorded",
        clarification_question=None,
        warnings=[],
        audit_log=[
            AuditLogEntry(
                timestamp=now_iso,
                action="created",
                actor=actor,
                summary=f"Ghi tay bút toán {'thu' if payload.type == 'revenue' else 'chi'} {amt_str}",
            )
        ],
        source="manual",
        created_at=now_iso,
        updated_at=now_iso,
    )
    return repo.save_transaction(tx)


@router.patch("/{tx_id}", response_model=Transaction)
async def patch_transaction(
    tx_id: str,
    payload: TransactionPatchRequest,
    session: dict[str, Any] = Depends(require_session),
) -> Transaction:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    tx = _get_owned_transaction(tx_id, hid)
    _ensure_period_unlocked(hid, tx.date)

    updates = payload.model_dump(exclude_unset=True)
    if "date" in updates and updates["date"]:
        _ensure_period_unlocked(hid, str(updates["date"]))

    changes: list[str] = []
    if "amount_vnd" in updates and updates["amount_vnd"] != tx.amount_vnd:
        old_a = f"{tx.amount_vnd:,}".replace(",", ".")
        new_a = f"{int(updates['amount_vnd']):,}".replace(",", ".")
        changes.append(f"Số tiền: {old_a} đ → {new_a} đ")
    if "counterparty" in updates and updates["counterparty"] != tx.counterparty:
        changes.append(f"Đối tác: {tx.counterparty or 'Trống'} → {updates['counterparty'] or 'Trống'}")
    if "date" in updates and updates["date"] != tx.date:
        changes.append(f"Ngày: {tx.date} → {updates['date']}")
    if "type" in updates and updates["type"] != tx.type:
        changes.append(f"Loại: {tx.type} → {updates['type']}")
    if "payment_method" in updates and updates["payment_method"] != tx.payment_method:
        changes.append(f"Thanh toán: {tx.payment_method} → {updates['payment_method']}")

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    updates["updated_at"] = now_iso
    if changes:
        updates["audit_log"] = _append_audit(tx, "edited", actor, "Cập nhật: " + "; ".join(changes), now_iso)
    updated_tx = tx.model_copy(update=updates)
    return repo.save_transaction(updated_tx)


@router.delete("/{tx_id}", status_code=204)
async def delete_transaction(
    tx_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> Response:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    tx = _get_owned_transaction(tx_id, hid)
    _ensure_period_unlocked(hid, tx.date)

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    soft_deleted = tx.model_copy(
        update={
            "status": "rejected",
            "audit_log": _append_audit(
                tx,
                "rejected",
                actor,
                "Xóa mềm (ẩn khỏi sổ chính, giữ nguyên nhật ký kiểm toán)",
                now_iso,
            ),
            "updated_at": now_iso,
        }
    )
    repo.save_transaction(soft_deleted)
    return Response(status_code=204)


@router.post("/{tx_id}/confirm", response_model=Transaction)
async def confirm_transaction(
    tx_id: str,
    payload: ConfirmRequest | None = None,
    session: dict[str, Any] = Depends(require_session),
) -> Transaction:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    tx = _get_owned_transaction(tx_id, hid)
    _ensure_period_unlocked(hid, tx.date)

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    merge_flag = payload.merge_into_duplicate if payload else False

    if merge_flag and tx.duplicate_of_id:
        orig_tx = repo.get_transaction(tx.duplicate_of_id)
        if orig_tx and orig_tx.household_id == hid:
            _ensure_period_unlocked(hid, orig_tx.date)
            merged_docs = list(orig_tx.linked_document_ids)
            for doc_id in ([tx.document_id] if tx.document_id else []) + tx.linked_document_ids:
                if doc_id and doc_id not in merged_docs:
                    merged_docs.append(doc_id)

            new_payment = "transfer" if tx.payment_method == "transfer" else orig_tx.payment_method
            updated_orig = orig_tx.model_copy(
                update={
                    "linked_document_ids": merged_docs,
                    "payment_method": new_payment,
                    "status": "recorded",
                    "clarification_question": None,
                    "audit_log": _append_audit(
                        orig_tx,
                        "merged",
                        actor,
                        f"Gộp chứng từ trùng chéo {tx.id} ({', '.join(merged_docs)})",
                        now_iso,
                    ),
                    "updated_at": now_iso,
                }
            )
            repo.save_transaction(updated_orig)

            rejected_dup = tx.model_copy(
                update={
                    "status": "rejected",
                    "clarification_question": None,
                    "audit_log": _append_audit(
                        tx,
                        "merged",
                        actor,
                        f"Đã gộp chứng từ vào bút toán gốc {orig_tx.id}",
                        now_iso,
                    ),
                    "updated_at": now_iso,
                }
            )
            repo.save_transaction(rejected_dup)
            return updated_orig

    confirmed_tx = tx.model_copy(
        update={
            "status": "recorded",
            "clarification_question": None,
            "audit_log": _append_audit(
                tx,
                "confirmed",
                actor,
                "Xác nhận duyệt ghi vào sổ chính",
                now_iso,
            ),
            "updated_at": now_iso,
        }
    )
    return repo.save_transaction(confirmed_tx)


@router.post("/{tx_id}/reject", response_model=Transaction)
async def reject_transaction(
    tx_id: str,
    payload: RejectRequest | None = None,
    session: dict[str, Any] = Depends(require_session),
) -> Transaction:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    tx = _get_owned_transaction(tx_id, hid)
    _ensure_period_unlocked(hid, tx.date)

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    reason_note = f" ({payload.reason})" if payload and payload.reason else ""
    rejected_tx = tx.model_copy(
        update={
            "status": "rejected",
            "audit_log": _append_audit(
                tx,
                "rejected",
                actor,
                f"Từ chối / Không ghi vào sổ{reason_note}",
                now_iso,
            ),
            "updated_at": now_iso,
        }
    )
    return repo.save_transaction(rejected_tx)
