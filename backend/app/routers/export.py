from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from backend.app.repositories.memory import repo
from backend.app.security import require_session
from backend.app.services.exporter import generate_export_zip, generate_tt152_excel

router = APIRouter(
    prefix="/api/export",
    tags=["export"],
    dependencies=[Depends(require_session)],
)


@router.get("")
async def export_ledger(
    month: str = Query("2026-11", pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    evidence: bool = Query(False),
    session: dict[str, Any] = Depends(require_session),
) -> Response:
    hid = str(session.get("hid", "demo"))
    if evidence:
        zip_bytes = generate_export_zip(
            repo=repo,
            month=month,
            household_id=hid,
        )
        filename = f"Keiki_SoKeToan_TT152_KemChungTu_{month}.zip"
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    xlsx_bytes = generate_tt152_excel(
        repo=repo,
        month=month,
        household_id=hid,
    )
    filename = f"Keiki_SoKeToan_TT152_{month}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
