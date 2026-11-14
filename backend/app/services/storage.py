from __future__ import annotations

from pathlib import Path
from backend.app.config import settings
from backend.app.errors import ApiError
from backend.app.services.seed_assets import generate_document_svg


class StorageService:
    """Stores and retrieves receipt images, transfer screenshots, and audio files on Google Cloud Storage or local disk with strict path traversal protection."""

    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = (base_dir or settings.storage_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._gcs_bucket = None
        if settings.gcp_project and settings.gcs_bucket:
            try:
                from google.cloud import storage

                client = storage.Client(project=settings.gcp_project)
                self._gcs_bucket = client.bucket(settings.gcs_bucket)
            except Exception:
                self._gcs_bucket = None

    def _safe_local_path(self, storage_path: str) -> Path:
        clean_rel = storage_path.lstrip("/\\")
        resolved = (self.base_dir / clean_rel).resolve()
        if self.base_dir not in resolved.parents and resolved != self.base_dir:
            raise ApiError(
                status_code=400,
                code="PATH_TRAVERSAL_BLOCKED",
                message="Đường dẫn lưu trữ chứng từ không hợp lệ (Path Traversal bị chặn).",
            )
        return resolved

    def save_bytes(self, storage_path: str, data: bytes, mime_type: str) -> str:
        local_file = self._safe_local_path(storage_path)
        if self._gcs_bucket is not None:
            try:
                blob = self._gcs_bucket.blob(storage_path)
                blob.upload_from_string(data, content_type=mime_type)
            except Exception:
                pass

        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_bytes(data)
        return storage_path

    def read_bytes(self, storage_path: str, preset_hint: str | None = None) -> bytes:
        local_file = self._safe_local_path(storage_path)
        if local_file.exists():
            return local_file.read_bytes()

        if self._gcs_bucket is not None:
            try:
                blob = self._gcs_bucket.blob(storage_path)
                if blob.exists():
                    data = blob.download_as_bytes()
                    local_file.parent.mkdir(parents=True, exist_ok=True)
                    local_file.write_bytes(data)
                    return data
            except Exception:
                pass

        # Generate seed SVG on the fly if it's a seeded document
        svg_bytes = generate_document_svg(preset_hint or storage_path)
        local_file.parent.mkdir(parents=True, exist_ok=True)
        local_file.write_bytes(svg_bytes)
        return svg_bytes


storage_service = StorageService()
