from __future__ import annotations

import os
import socket
from typing import Any
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from backend.app.core.config import settings
from backend.app.core.errors import ApiError
from backend.app.core.security import (
    get_optional_session,
    is_loopback_request,
    require_google_client_id_permission,
    require_secret_mutation_permission,
)
from backend.app.models import ApiKeyUpdateRequest
from backend.app.repositories import repo

router = APIRouter(prefix="/api/settings", tags=["settings"])


class GoogleClientIdUpdateRequest(BaseModel):
    google_client_id: str


def _get_lan_urls(port: int = 8080) -> list[str]:
    if settings.is_cloud_run:
        return []
    urls: list[str] = []
    tunnel_url = os.environ.get("PUBLIC_TUNNEL_URL", "").strip()
    if tunnel_url:
        urls.append(tunnel_url)
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = str(info[4][0])
            if not ip.startswith(("127.", "169.254.", "26.")):
                url = f"http://{ip}:{port}"
                if url not in urls:
                    urls.append(url)
    except Exception:
        pass
    return urls or [f"http://localhost:{port}"]


@router.get("/status")
async def get_settings_status(request: Request) -> dict[str, object]:
    session = get_optional_session(request)
    active_key = bool(settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "").strip())
    hid = str(session.get("hid", "")) if session else ""
    return {
        "authenticated": bool(session),
        "gemini_configured": active_key,
        "gemini_model": settings.gemini_model,
        "google_client_id": settings.google_client_id or os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
        "gcp_project": (settings.gcp_project or None) if session else None,
        "household": repo.get_household(hid) if session else None,
        "lan_urls": _get_lan_urls(settings.port) if (session and is_loopback_request(request)) else [],
    }


@router.post("/apikey")
async def update_gemini_apikey(
    payload: ApiKeyUpdateRequest,
    _admin: dict[str, Any] = Depends(require_secret_mutation_permission),
) -> dict[str, object]:
    clean_key = payload.gemini_api_key.strip()
    settings.gemini_api_key = clean_key
    os.environ["GEMINI_API_KEY"] = clean_key
    if payload.gemini_model.strip():
        settings.gemini_model = payload.gemini_model.strip()
        os.environ["GEMINI_MODEL"] = settings.gemini_model
    return {
        "status": "ok",
        "gemini_configured": bool(clean_key),
        "gemini_model": settings.gemini_model,
        "message": "Đã cập nhật khóa Google Gemini API thành công!",
    }


@router.delete("/apikey")
async def clear_gemini_apikey(
    _admin: dict[str, Any] = Depends(require_secret_mutation_permission),
) -> dict[str, object]:
    settings.gemini_api_key = ""
    os.environ.pop("GEMINI_API_KEY", None)
    return {
        "status": "ok",
        "gemini_configured": False,
        "message": "Đã xóa khóa Gemini API khỏi bộ nhớ phiên.",
    }


@router.post("/google-client-id")
async def update_google_client_id(
    payload: GoogleClientIdUpdateRequest,
    _admin: dict[str, Any] = Depends(require_google_client_id_permission),
) -> dict[str, object]:
    clean_id = payload.google_client_id.strip()
    if not clean_id:
        raise ApiError(
            status_code=400,
            code="INVALID_GOOGLE_CLIENT_ID",
            message="Google OAuth Client ID không được để trống.",
        )
    settings.google_client_id = clean_id
    os.environ["GOOGLE_CLIENT_ID"] = clean_id
    return {
        "status": "ok",
        "google_client_id": clean_id,
        "message": "Đã lưu Google OAuth Client ID thành công!",
    }
