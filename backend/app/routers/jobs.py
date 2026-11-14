from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from backend.app.core.errors import ApiError
from backend.app.core.security import require_session, validate_safe_id
from backend.app.models import JobRecord
from backend.app.repositories import repo
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
    clean_id = validate_safe_id(job_id, "job_id")
    hid = str(session.get("hid", ""))
    job = repo.get_job(clean_id)
    if not job or job.household_id != hid:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Không tìm thấy tiến trình xử lý chứng từ.")
    return job


@router.get("/{job_id}/stream")
async def stream_job(
    job_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> StreamingResponse:
    clean_id = validate_safe_id(job_id, "job_id")
    hid = str(session.get("hid", ""))
    job = repo.get_job(clean_id)
    if not job or job.household_id != hid:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Không tìm thấy tiến trình xử lý chứng từ.")

    return StreamingResponse(
        job_runner.stream_events(clean_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
