from __future__ import annotations

import os
import secrets
from pathlib import Path
from pydantic import BaseModel


def _load_local_dotenv() -> None:
    """Load local .env file (if present) without overriding existing OS / Cloud Run env vars."""
    backend_dir = Path(__file__).resolve().parent.parent.parent
    repo_app_dir = backend_dir.parent
    repo_root_dir = repo_app_dir.parent
    candidates = [
        backend_dir / ".env",
        repo_app_dir / ".env",
        repo_root_dir / ".env",
    ]
    for env_path in candidates:
        if not env_path.is_file():
            continue
        try:
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                if line.startswith("export "):
                    line = line[7:].strip()
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
                    val = val[1:-1]
                if key:
                    os.environ.setdefault(key, val)
        except Exception:
            pass


_load_local_dotenv()

# Generated once per process using CSPRNG if SESSION_SECRET is unset (never derived from predictable host/path)
_EPHEMERAL_RUNTIME_SECRET: str = secrets.token_hex(32)


def _get_session_secret() -> str:
    env_sec = os.environ.get("SESSION_SECRET", "").strip()
    if env_sec:
        return env_sec
    return _EPHEMERAL_RUNTIME_SECRET


class AppConfig(BaseModel):
    port: int = int(os.environ.get("PORT", "8080"))
    gcp_project: str = os.environ.get("GCP_PROJECT", "").strip()
    gcs_bucket: str = os.environ.get("GCS_BUCKET", "").strip()
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "").strip()
    gemini_model: str = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
    google_client_id: str = os.environ.get(
        "GOOGLE_CLIENT_ID",
        "407438910099-fbr88s4baevcju84kqumkt9mkks9v60h.apps.googleusercontent.com",
    ).strip()
    is_cloud_run: bool = bool(
        os.environ.get("K_SERVICE", "").strip()
        or os.environ.get("CLOUD_RUN_JOB", "").strip()
        or os.environ.get("KUBERNETES_SERVICE_HOST", "").strip()
        or os.environ.get("APP_ENV", "").strip().lower() == "production"
    )
    admin_token: str = os.environ.get("ADMIN_TOKEN", "").strip()
    session_secret: str = _get_session_secret()
    session_ttl_seconds: int = int(os.environ.get("SESSION_TTL_SECONDS", "86400"))
    trust_proxy_headers: bool = os.environ.get("TRUST_PROXY_HEADERS", "false").lower() == "true"
    trusted_proxy_hops: int = max(1, int(os.environ.get("TRUSTED_PROXY_HOPS", "1")))
    max_upload_mb: int = int(os.environ.get("MAX_UPLOAD_MB", "8"))
    enable_rate_limit: bool = os.environ.get("ENABLE_RATE_LIMIT", "true").lower() == "true"
    rate_limit_ai_per_min: int = int(os.environ.get("RATE_LIMIT_AI_PER_MIN", "25"))
    rate_limit_auth_per_min: int = int(os.environ.get("RATE_LIMIT_AUTH_PER_MIN", "30"))
    rate_limit_general_per_min: int = int(os.environ.get("RATE_LIMIT_GENERAL_PER_MIN", "180"))
    allowed_origins: list[str] = [
        o.strip()
        for o in os.environ.get(
            "ALLOWED_ORIGINS",
            "https://keiki-app-303049082320.asia-southeast1.run.app,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173",
        ).split(",")
        if o.strip()
    ]
    storage_dir: Path = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


settings = AppConfig()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
