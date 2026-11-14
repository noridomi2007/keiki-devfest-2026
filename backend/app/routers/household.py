from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends

from backend.app.core.security import require_session
from backend.app.models import HouseholdProfileUpdateRequest
from backend.app.repositories import repo

router = APIRouter(
    prefix="/api/household",
    tags=["household"],
    dependencies=[Depends(require_session)],
)


@router.patch("/profile")
async def update_household_profile(
    payload: HouseholdProfileUpdateRequest,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, object]:
    hid = str(session.get("hid", ""))
    existing = dict(repo.get_household(hid) or {})
    updated = {
        **existing,
        "id": hid,
        "name": payload.name.strip() or existing.get("name", "Hộ kinh doanh cá thể"),
        "owner": payload.owner.strip() or existing.get("owner", "Chủ hộ kinh doanh"),
        "tax_code": payload.tax_code.strip(),
        "address": payload.address.strip(),
        "phone": payload.phone.strip() or existing.get("phone", ""),
        "business_sector": payload.business_sector.strip() or "Thương mại & Dịch vụ tổng hợp",
        "revenue_tier": payload.revenue_tier,
        "tax_method": payload.tax_method,
    }
    saved = repo.save_household(hid, updated)
    return {
        "status": "ok",
        "household": saved,
        "message": "Đã cập nhật hồ sơ hộ kinh doanh thành công!",
    }


@router.get("/backup")
async def export_household_backup(
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, object]:
    hid = str(session.get("hid", ""))
    hh = repo.get_household(hid)
    all_txs = [
        t.model_dump()
        for t in repo.transactions.values()
        if t.household_id == hid
    ]
    locks = {
        k: v
        for k, v in repo.locked_periods.items()
        if k.startswith(f"{hid}:")
    }
    return {
        "household": hh,
        "transactions": all_txs,
        "locked_periods": locks,
    }
