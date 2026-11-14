from __future__ import annotations

import hashlib
import re
from typing import Any
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel

from agent.schemas import DocumentKind, DocumentRef
from backend.app.config import settings
from backend.app.errors import ApiError
from backend.app.models import DocumentRecord
from backend.app.repositories.memory import repo
from backend.app.security import (
    read_upload_bounded,
    require_session,
    sanitize_prompt_input,
    validate_file_security,
)
from backend.app.services.jobs import job_runner
from backend.app.services.storage import storage_service

router = APIRouter(
    prefix="/api/documents",
    tags=["documents"],
    dependencies=[Depends(require_session)],
)
_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")

# User uploads strictly exclude image/svg+xml to eliminate SVG XSS/XXE attack surface
ALLOWED_MIMES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/webm": ".webm",
    "audio/mp4": ".mp4",
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
}


@router.post("", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    kind: DocumentKind = Form("image"),
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, str]:
    hid = str(session.get("hid", ""))
    raw_mime = (file.content_type or "image/jpeg").split(";")[0].strip().lower()
    if raw_mime not in ALLOWED_MIMES:
        raise ApiError(
            status_code=415,
            code="UNSUPPORTED_MEDIA_TYPE",
            message=f"Định dạng tệp '{raw_mime}' không được phép tải lên. Anh/chị vui lòng gửi ảnh (JPEG/PNG/WebP) hoặc ghi âm nhé.",
        )

    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await read_upload_bounded(file, max_bytes)

    is_valid_content, sec_err = validate_file_security(data, raw_mime)
    if not is_valid_content:
        raise ApiError(
            status_code=400,
            code="INVALID_FILE_CONTENT",
            message=sec_err,
        )

    safe_filename = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", file.filename or "upload")[:80]

    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    ext = ALLOWED_MIMES.get(raw_mime, ".bin")
    storage_path = f"{hid}/{doc_id}{ext}"
    sha256_hex = hashlib.sha256(data).hexdigest()

    storage_service.save_bytes(storage_path, data, raw_mime)

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    doc_record = DocumentRecord(
        id=doc_id,
        household_id=hid,
        kind=kind,
        mime_type=raw_mime,
        sha256=sha256_hex,
        storage_path=storage_path,
        uploaded_at=now_iso,
        preset_hint=None,
    )
    repo.save_document(doc_record)

    doc_ref = DocumentRef(
        document_id=doc_id,
        kind=kind,
        mime_type=raw_mime,
        data=data,
        sha256=sha256_hex,
        filename=safe_filename,
        preset_hint=None,
    )
    job = job_runner.start_job(doc_ref=doc_ref, household_id=hid)
    return {"document_id": doc_id, "job_id": job.id}


class VoiceTextRequest(BaseModel):
    transcript: str


@router.post("/voice-text", status_code=201)
async def submit_voice_text(
    payload: VoiceTextRequest,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, str]:
    """Endpoint for natural-language Vietnamese spoken/typed transaction entry."""
    hid = str(session.get("hid", ""))
    clean_transcript = sanitize_prompt_input(payload.transcript, max_len=500)
    if len(clean_transcript) < 3:
        raise ApiError(
            status_code=400,
            code="EMPTY_TRANSCRIPT",
            message="Nội dung câu nói quá ngắn. Anh/chị vui lòng nói hoặc nhập rõ giao dịch nhé.",
        )

    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    storage_path = f"{hid}/{doc_id}.txt"
    data = clean_transcript.encode("utf-8")
    sha256_hex = hashlib.sha256(data + doc_id.encode()).hexdigest()
    hint = f"voice:{clean_transcript}"
    mime_type = "text/plain; charset=utf-8"

    storage_service.save_bytes(storage_path, data, mime_type)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    doc_record = DocumentRecord(
        id=doc_id,
        household_id=hid,
        kind="audio",
        mime_type=mime_type,
        sha256=sha256_hex,
        storage_path=storage_path,
        uploaded_at=now_iso,
        preset_hint=hint,
    )
    repo.save_document(doc_record)

    doc_ref = DocumentRef(
        document_id=doc_id,
        kind="audio",
        mime_type=mime_type,
        data=data,
        sha256=sha256_hex,
        filename="lenh_giong_noi.txt",
        preset_hint=hint,
    )
    job = job_runner.start_job(doc_ref=doc_ref, household_id=hid)
    return {"document_id": doc_id, "job_id": job.id}


@router.get("/{doc_id}/file")
async def get_document_file(
    doc_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> Response:
    if not _SAFE_ID_RE.match(doc_id):
        raise ApiError(status_code=400, code="INVALID_DOC_ID", message="Mã chứng từ không hợp lệ.")
    hid = str(session.get("hid", ""))
    doc = repo.get_document(doc_id)
    if not doc or doc.household_id != hid:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Không tìm thấy tệp chứng từ gốc.")

    raw_bytes = storage_service.read_bytes(doc.storage_path, doc.preset_hint)
    return Response(
        content=raw_bytes,
        media_type=doc.mime_type,
        headers={
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )
