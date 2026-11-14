from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import re
import secrets
import time
import urllib.parse
from collections import deque
from typing import Any
from fastapi import Depends, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.config import settings
from backend.app.errors import ApiError

SESSION_COOKIE_NAME = "keiki_session"

DEFAULT_CSP_POLICY = (
    "default-src 'self'; "
    "script-src 'self' https://accounts.google.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob: https://*.googleusercontent.com; "
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com; "
    "frame-src https://accounts.google.com; "
    "media-src 'self' blob: data:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'self'"
)

# Dangerous patterns in SVG files (XSS, entity-encoded JS, & XXE prevention)
_DANGEROUS_SVG_PATTERNS = re.compile(
    r"(<\s*script|javascript\s*:|vbscript\s*:|data\s*:\s*text/html|"
    r"\bon[a-z]+\s*=|<\s*iframe|<\s*object|<\s*embed|<\s*foreignObject|"
    r"xlink:href\s*=\s*['\"]?\s*(?!#)|href\s*=\s*['\"]?\s*(?:javascript|data|http)|"
    r"<!ENTITY|<!DOCTYPE)",
    re.IGNORECASE,
)

# Common Prompt Injection patterns to neutralize in untrusted voice/OCR text
_PROMPT_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(all\s+)?(previous|prior|above)\s+instructions|"
    r"disregard\s+(all\s+)?(previous|prior)\s+instructions|"
    r"you\s+are\s+now\s+a|system\s*prompt\s*:|</?\s*system\s*>|"
    r"bỏ\s+qua\s+(mọi\s+|tất\s+cả\s+)?hướng\s+dẫn\s+trước)",
    re.IGNORECASE,
)

# Server-side revoked session token JTI denylist (prevents token replay after logout)
_REVOKED_JTIS: dict[str, int] = {}


def _cleanup_revoked_jtis() -> None:
    if len(_REVOKED_JTIS) > 2000:
        now = int(time.time())
        expired = [k for k, exp in _REVOKED_JTIS.items() if exp < now]
        for k in expired:
            _REVOKED_JTIS.pop(k, None)


def create_session_token(
    household_id: str,
    owner: str,
    email: str = "",
    auth_method: str = "demo",
) -> str:
    """Issue an HMAC-SHA256 signed session token with a unique revocable JTI."""
    payload = {
        "jti": secrets.token_hex(12),
        "hid": household_id,
        "owner": owner,
        "email": email,
        "auth": auth_method,
        "exp": int(time.time()) + settings.session_ttl_seconds,
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    sig = hmac.new(
        settings.session_secret.encode("utf-8"),
        b64.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{b64}.{sig}"


def verify_session_token(token: str) -> dict[str, Any] | None:
    """Verify HMAC-SHA256 signature, expiration, and server-side revocation status."""
    if not token or "." not in token:
        return None
    try:
        b64, sig = token.split(".", 1)
        expected_sig = hmac.new(
            settings.session_secret.encode("utf-8"),
            b64.encode("ascii"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        padded = b64 + "=" * (-len(b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        jti = str(payload.get("jti", ""))
        if not jti or jti in _REVOKED_JTIS:
            return None
        return payload
    except Exception:
        return None


def revoke_session_token(token: str) -> None:
    """Revoke a session token's JTI so it cannot be replayed after logout."""
    _cleanup_revoked_jtis()
    claims = verify_session_token(token)
    if claims and "jti" in claims:
        _REVOKED_JTIS[str(claims["jti"])] = int(claims.get("exp", int(time.time()) + 86400))


def extract_raw_token(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
    return token


def extract_all_tokens(request: Request) -> list[str]:
    tokens: list[str] = []
    cookie_tok = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
    if cookie_tok:
        tokens.append(cookie_tok)
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        bearer_tok = auth_header[7:].strip()
        if bearer_tok and bearer_tok not in tokens:
            tokens.append(bearer_tok)
    return tokens


def is_https_request(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if settings.trust_proxy_headers:
        return request.headers.get("x-forwarded-proto", "").lower() == "https"
    return False


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=is_https_request(request),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def get_optional_session(request: Request) -> dict[str, Any] | None:
    token = extract_raw_token(request)
    if not token:
        return None
    return verify_session_token(token)


async def require_session(request: Request) -> dict[str, Any]:
    """FastAPI dependency enforcing authenticated HttpOnly session on protected routes."""
    session = get_optional_session(request)
    if not session:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Phiên đăng nhập chưa được xác thực hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        )
    return session


async def require_admin_or_demo(
    request: Request,
    active_session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    """Restrict server-wide configuration changes to DEMO_MODE or explicit X-Admin-Token."""
    if settings.demo_mode:
        return active_session
    provided_admin = request.headers.get("x-admin-token", "").strip()
    if settings.admin_token and provided_admin and hmac.compare_digest(provided_admin, settings.admin_token):
        return active_session
    raise ApiError(
        status_code=403,
        code="FORBIDDEN_IN_PRODUCTION",
        message="Không được phép thay đổi cấu hình hệ thống toàn cục trong chế độ Production.",
    )


async def read_upload_bounded(file: UploadFile, max_bytes: int) -> bytes:
    """Read an uploaded file in 64KB chunks, aborting immediately if size exceeds max_bytes."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ApiError(
                status_code=413,
                code="FILE_TOO_LARGE",
                message=f"Tệp lớn hơn giới hạn cho phép ({settings.max_upload_mb} MB).",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def sanitize_spreadsheet_cell(value: Any) -> Any:
    """Prevent Excel / Google Sheets / CSV Formula Injection (DDE / =HYPERLINK attacks)."""
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped and stripped[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{value}"
    return value


def validate_file_security(data: bytes, mime_type: str) -> tuple[bool, str]:
    """
    Validate binary magic bytes for all supported image & audio formats,
    and decode HTML/URL entities before scanning SVG content.
    """
    if not data:
        return False, "Tệp tải lên rỗng."

    if mime_type == "image/jpeg":
        if not data.startswith(b"\xff\xd8\xff"):
            return False, "Tệp giả mạo định dạng JPEG (Magic bytes không hợp lệ)."

    elif mime_type == "image/png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return False, "Tệp giả mạo định dạng PNG (Magic bytes không hợp lệ)."

    elif mime_type == "image/webp":
        if len(data) < 12 or not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
            return False, "Tệp giả mạo định dạng WebP (Magic bytes không hợp lệ)."

    elif mime_type == "image/svg+xml":
        try:
            raw_text = data[:65536].decode("utf-8", errors="ignore")
        except Exception:
            return False, "Tệp SVG không hợp lệ."
        # Decode HTML character references (e.g. javascript&#58;) and URL encoding twice
        decoded_text = urllib.parse.unquote(html.unescape(html.unescape(raw_text)))
        normalized_text = re.sub(r"[\x00-\x20]+", " ", decoded_text)
        if "<svg" not in normalized_text.lower():
            return False, "Nội dung tệp không phải là định dạng SVG hợp lệ."
        if _DANGEROUS_SVG_PATTERNS.search(normalized_text):
            return (
                False,
                "Phát hiện mã độc XSS/Script hoặc thực thể XXE bên trong tệp SVG. Đã chặn tải lên!",
            )

    elif mime_type == "audio/webm":
        if not data.startswith(b"\x1a\x45\xdf\xa3"):
            return False, "Tệp giả mạo định dạng âm thanh WebM (Magic bytes EBML không hợp lệ)."

    elif mime_type == "audio/mp4":
        if len(data) < 12 or data[4:8] != b"ftyp":
            return False, "Tệp giả mạo định dạng âm thanh MP4/M4A (Magic bytes ftyp không hợp lệ)."

    elif mime_type == "audio/mpeg":
        is_id3 = data.startswith(b"ID3")
        is_mp3_sync = len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0
        if not (is_id3 or is_mp3_sync):
            return False, "Tệp giả mạo định dạng âm thanh MP3 (Magic bytes không hợp lệ)."

    elif mime_type == "audio/wav":
        if len(data) < 12 or not (data.startswith(b"RIFF") and data[8:12] == b"WAVE"):
            return False, "Tệp âm thanh WAV không hợp lệ."

    elif mime_type == "audio/ogg":
        if not data.startswith(b"OggS"):
            return False, "Tệp âm thanh OGG không hợp lệ."

    else:
        return False, f"Định dạng '{mime_type}' không được phép tải lên."

    return True, ""


def sanitize_prompt_input(text: str | None, max_len: int = 600) -> str:
    """Sanitize user-supplied voice transcript or text against LLM Prompt Injection and control chars."""
    if not text:
        return ""
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text).strip()
    cleaned = cleaned[:max_len]
    cleaned = _PROMPT_INJECTION_PATTERNS.sub("[ĐÃ_LỌC_LỆNH_LẠ]", cleaned)
    return cleaned


class SlidingWindowRateLimiter:
    """
    In-memory multi-tier sliding-window rate limiter to protect against DDoS,
    Gemini API wallet-draining, and brute-force attacks.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._last_cleanup: float = time.monotonic()

    def reset(self) -> None:
        self._buckets.clear()

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> tuple[bool, int, int]:
        """Returns (allowed, remaining_quota, retry_after_seconds)."""
        now = time.monotonic()

        if now - self._last_cleanup > 120.0 or len(self._buckets) > 5000:
            cutoff = now - window_seconds
            stale_keys = [
                k for k, q in self._buckets.items() if not q or q[-1] < cutoff
            ]
            for k in stale_keys:
                self._buckets.pop(k, None)
            self._last_cleanup = now

        q = self._buckets.get(key)
        if q is None:
            q = deque()
            self._buckets[key] = q

        cutoff = now - window_seconds
        while q and q[0] <= cutoff:
            q.popleft()

        if len(q) >= limit:
            retry_after = max(1, int(window_seconds - (now - q[0])) + 1)
            return False, 0, retry_after

        q.append(now)
        remaining = max(0, limit - len(q))
        return True, remaining, 0

    def is_blocked(self, key: str, limit: int, window_seconds: float = 300.0) -> tuple[bool, int]:
        """Check whether key has reached `limit` events in the window without recording a new hit."""
        now = time.monotonic()
        q = self._buckets.get(key)
        if not q:
            return False, 0
        cutoff = now - window_seconds
        while q and q[0] <= cutoff:
            q.popleft()
        if len(q) >= limit:
            retry_after = max(1, int(window_seconds - (now - q[0])) + 1)
            return True, retry_after
        return False, 0

    def record_hit(self, key: str, window_seconds: float = 300.0) -> int:
        """Record an event timestamp for `key` and return current count within the window."""
        now = time.monotonic()
        cutoff = now - window_seconds
        q = self._buckets.get(key)
        if q is None:
            q = deque()
            self._buckets[key] = q
        while q and q[0] <= cutoff:
            q.popleft()
        q.append(now)
        return len(q)

    def clear_key(self, key: str) -> None:
        """Reset bucket for a specific key (e.g. after successful login)."""
        self._buckets.pop(key, None)


rate_limiter = SlidingWindowRateLimiter()


def _extract_origin_from_headers(request: Request) -> tuple[str | None, str]:
    """Return (source_origin, fetch_site) from browser CSRF headers."""
    fetch_site = request.headers.get("sec-fetch-site", "").strip().lower()
    origin_hdr = request.headers.get("origin", "").strip()
    if origin_hdr:
        if origin_hdr.lower() == "null":
            return "null", fetch_site
        parsed = urllib.parse.urlsplit(origin_hdr)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}", fetch_site
        return origin_hdr.lower(), fetch_site

    referer_hdr = request.headers.get("referer", "").strip()
    if referer_hdr:
        parsed = urllib.parse.urlsplit(referer_hdr)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}", fetch_site

    return None, fetch_site


def _is_trusted_csrf_request(request: Request) -> bool:
    """Validate Origin/Referer/Sec-Fetch-Site for state-changing requests authenticated by session cookie."""
    method = request.method.upper()
    if method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return True
    if not request.url.path.startswith("/api/"):
        return True
    # Only cookie-authenticated flows are exposed to browser CSRF (Bearer API calls are exempt)
    if SESSION_COOKIE_NAME not in request.cookies:
        return True

    source_origin, fetch_site = _extract_origin_from_headers(request)
    if fetch_site == "cross-site":
        return False

    if source_origin is None:
        return True
    if source_origin == "null":
        return False

    host_hdr = (
        request.headers.get("x-forwarded-host", "").split(",")[0].strip().lower()
        if settings.trust_proxy_headers
        else ""
    ) or request.headers.get("host", "").strip().lower()
    if not host_hdr and request.url.netloc:
        host_hdr = request.url.netloc.lower()

    expected_scheme = "https" if is_https_request(request) else request.url.scheme.lower()
    allowed: set[str] = set()
    if host_hdr:
        allowed.add(f"{expected_scheme}://{host_hdr}")
        # Allow local http scheme match as well when behind localhost/reverse proxy
        allowed.add(f"{request.url.scheme.lower()}://{host_hdr}")
    if settings.demo_mode:
        for orig in settings.allowed_origins:
            allowed.add(orig.rstrip("/").lower())
    else:
        for orig in settings.allowed_origins:
            cleaned = orig.rstrip("/").lower()
            if cleaned.startswith("https://"):
                allowed.add(cleaned)

    return source_origin in allowed


def _get_client_ip(request: Request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                # Take the right-most untrusted peer IP added by our trusted reverse proxies
                idx = max(0, len(parts) - settings.trusted_proxy_hops)
                return parts[idx]
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _classify_route_tier(method: str, path: str) -> tuple[str, int]:
    """Return (tier_name, requests_per_minute_limit)."""
    if (
        (method == "POST" and path.startswith("/api/documents"))
        or path.startswith("/api/export")
    ):
        return "heavy_ai_export", settings.rate_limit_ai_per_min

    if path.startswith("/api/auth") or path.startswith("/api/settings") or path.startswith("/api/tts"):
        return "auth_tts", settings.rate_limit_auth_per_min

    return "general_api", settings.rate_limit_general_per_min


class SecurityShieldMiddleware(BaseHTTPMiddleware):
    """
    Production Security Middleware for Keiki:
    1. Early Content-Length Payload Bomb Shield (413 before reading into RAM)
    2. Multi-Tier Sliding-Window Anti-DDoS Rate Limiter (429 Too Many Requests)
    3. Strict OWASP HTTP Security Headers (CSP, HSTS on HTTPS, X-Frame-Options, nosniff)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method.upper()

        content_length_str = request.headers.get("content-length")
        if content_length_str and content_length_str.isdigit():
            max_allowed = (settings.max_upload_mb + 1) * 1024 * 1024
            if int(content_length_str) > max_allowed:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "PAYLOAD_TOO_LARGE",
                            "message": f"Kích thước dữ liệu gửi lên vượt quá giới hạn bảo mật ({settings.max_upload_mb} MB).",
                        }
                    },
                )

        rate_limit_val = 0
        rate_remaining = 0
        if path.startswith("/api/") and settings.enable_rate_limit:
            client_ip = _get_client_ip(request)
            tier_name, limit_per_min = _classify_route_tier(method, path)
            bucket_key = f"{client_ip}:{tier_name}"
            allowed, remaining, retry_after = rate_limiter.check(
                bucket_key, limit=limit_per_min, window_seconds=60.0
            )
            rate_limit_val = limit_per_min
            rate_remaining = remaining

            if not allowed:
                return JSONResponse(
                    status_code=429,
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(limit_per_min),
                        "X-RateLimit-Remaining": "0",
                    },
                    content={
                        "error": {
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": (
                                f"Hệ thống chống DDoS: Bạn thao tác quá nhanh ({limit_per_min} yêu cầu/phút). "
                                f"Vui lòng đợi {retry_after} giây rồi thử lại nhé."
                            ),
                        }
                    },
                )

        if not _is_trusted_csrf_request(request):
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "CSRF_ORIGIN_MISMATCH",
                        "message": "Yêu cầu bị từ chối bởi chính sách bảo vệ CSRF (Origin không hợp lệ).",
                    }
                },
            )

        response: Response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
        if "Content-Security-Policy" not in response.headers:
            response.headers["Content-Security-Policy"] = DEFAULT_CSP_POLICY
        if is_https_request(request):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        if rate_limit_val > 0:
            response.headers["X-RateLimit-Limit"] = str(rate_limit_val)
            response.headers["X-RateLimit-Remaining"] = str(rate_remaining)

        return response
