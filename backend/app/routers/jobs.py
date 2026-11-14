from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from backend.app.errors import ApiError
from backend.app.models import JobRecord
from backend.app.repositories.memory import repo
from backend.app.security import require_session
from backend.app.services.jobs import job_runner

router = APIRouter(
    prefix="/api/jobs",
    tags=["jobs"],
    dependencies=[Depends(require_session)],
)


@router.get("/{job_id}", response_model=JobRecord)
async def get_job(
    job_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> JobRecord:
    hid = str(session.get("hid", "demo"))
    job = repo.get_job(job_id)
    if not job or job.household_id != hid:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Không tìm thấy tiến trình xử lý chứng từ.")
    return job


@router.get("/{job_id}/stream")
async def stream_job(
    job_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> StreamingResponse:
    hid = str(session.get("hid", "demo"))
    job = repo.get_job(job_id)
    if not job or job.household_id != hid:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Không tìm thấy tiến trình xử lý chứng từ.")

    return StreamingResponse(
        job_runner.stream_events(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
