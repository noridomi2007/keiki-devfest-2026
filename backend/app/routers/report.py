from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Query
from backend.app.models import PeriodLockRequest, PeriodLockState, ReportResponse
from backend.app.repositories.memory import repo
from backend.app.security import require_session
from backend.app.services.report import build_report

router = APIRouter(
    prefix="/api/report",
    tags=["report"],
    dependencies=[Depends(require_session)],
)


@router.get("", response_model=ReportResponse)
async def get_report(
    period: str = Query("month"),
    anchor: str = Query("2026-11-12"),
    session: dict[str, Any] = Depends(require_session),
) -> ReportResponse:
    hid = str(session.get("hid", "demo"))
    return await build_report(
        repo=repo,
        household_id=hid,
        period=period,
        anchor=anchor,
    )


@router.post("/lock", response_model=PeriodLockState)
async def lock_report_period(
    payload: PeriodLockRequest,
    session: dict[str, Any] = Depends(require_session),
) -> PeriodLockState:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    res = repo.set_period_lock(hid, payload.month, locked=True, actor=actor)
    return PeriodLockState.model_validate(res)


@router.post("/unlock", response_model=PeriodLockState)
async def unlock_report_period(
    payload: PeriodLockRequest,
    session: dict[str, Any] = Depends(require_session),
) -> PeriodLockState:
    hid = str(session.get("hid", "demo"))
    actor = str(session.get("owner") or "Chủ hộ")
    res = repo.set_period_lock(hid, payload.month, locked=False, actor=actor)
    return PeriodLockState.model_validate(res)
