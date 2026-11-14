from __future__ import annotations

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.core.config import settings
from backend.app.core.errors import ApiError, api_error_handler, unhandled_exception_handler
from backend.app.core.security import SecurityShieldMiddleware
from backend.app.routers import (
    agent_chat,
    auth,
    documents,
    export,
    household,
    jobs,
    report,
    settings as settings_router,
    transactions,
    tts,
)

app = FastAPI(
    title="Keiki — Trợ lý AI Kế toán Đa nền tảng cho Doanh nghiệp SME & Hộ Kinh Doanh",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None if settings.is_cloud_run else "/openapi.json",
)

app.add_middleware(SecurityShieldMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(auth.router)
app.include_router(household.router)
app.include_router(settings_router.router)
app.include_router(documents.router)
app.include_router(jobs.router)
app.include_router(transactions.router)
app.include_router(report.router)
app.include_router(export.router)
app.include_router(tts.router)
app.include_router(agent_chat.router)


@app.get("/api/health")
async def health_check() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "keiki",
        "gemini_configured": bool(settings.gemini_api_key),
        "model": settings.gemini_model,
        "security_shield": "active",
    }


STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        base_resolved = STATIC_DIR.resolve()
        candidate = (STATIC_DIR / full_path).resolve()
        if full_path and base_resolved in candidate.parents and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(STATIC_DIR / "index.html"))
