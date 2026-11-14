from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import re
import secrets
import socket
from typing import Any
import httpx
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.errors import ApiError
from backend.app.models import (
    ApiKeyUpdateRequest,
    HouseholdProfileUpdateRequest,
    PasswordChangeRequest,
)
from backend.app.repositories.memory import repo
from backend.app.security import (
    clear_session_cookie,
    create_session_token,
    extract_all_tokens,
    get_optional_session,
    rate_limiter,
    require_admin_or_demo,
    require_session,
    revoke_session_token,
    set_session_cookie,
)

router = APIRouter(prefix="/api", tags=["demo, auth & settings"])

_ACCOUNT_MAX_FAILS = 5
_ACCOUNT_LOCK_SECONDS = 300.0
_REGISTER_LOCKS: dict[str, asyncio.Lock] = {}


def _get_register_lock(norm_phone: str) -> asyncio.Lock:
    if len(_REGISTER_LOCKS) > 5000:
        idle = [k for k, lk in _REGISTER_LOCKS.items() if not lk.locked()]
        for k in idle[:2500]:
            _REGISTER_LOCKS.pop(k, None)
    lock = _REGISTER_LOCKS.get(norm_phone)
    if lock is None:
        lock = asyncio.Lock()
        _REGISTER_LOCKS[norm_phone] = lock
    return lock


def _normalize_phone(phone: str) -> str:
    return re.sub(r"[^0-9]", "", phone or "")


def _is_truthy_verified(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() == "true"
    return False


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    actual_salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=actual_salt,
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )
    return actual_salt.hex(), digest.hex()


def _verify_password(password: str, salt_hex: str, expected_hash_hex: str) -> bool:
    if not password or len(password) > 256:
        return False
    try:
        salt = bytes.fromhex(salt_hex)
        _, computed_hex = _hash_password(password, salt)
        return hmac.compare_digest(computed_hex, expected_hash_hex)
    except Exception:
        return False


# Dummy hash precomputed at module import to keep timing consistent on unknown phones
_DUMMY_SALT_HEX, _DUMMY_HASH_HEX = _hash_password("dummy-timing-guard-placeholder")


def _get_lan_urls(port: int = 8080) -> list[str]:
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


class RegisterRequest(BaseModel):
    phone: str
    password: str
    owner: str
    name: str
    tax_code: str = ""
    address: str = "TP. Hồ Chí Minh"


class LoginRequest(BaseModel):
    owner: str = ""
    name: str = ""
    phone: str = ""
    password: str | None = None
    tax_code: str = ""
    address: str = "TP. Hồ Chí Minh"
    email: str | None = None
    picture: str | None = None
    auth_method: str = "phone"


class GoogleOAuthLoginRequest(BaseModel):
    access_token: str | None = None
    credential: str | None = None
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    shop_name: str = "Hộ kinh doanh (Google)"
    tax_code: str = ""
    address: str = "TP. Hồ Chí Minh"


class GoogleClientIdUpdateRequest(BaseModel):
    google_client_id: str


@router.post("/auth/register")
async def register_household(
    payload: RegisterRequest,
    request: Request,
    response: Response,
) -> dict[str, object]:
    norm_phone = _normalize_phone(payload.phone)
    if len(norm_phone) < 8 or len(norm_phone) > 15:
        raise ApiError(
            status_code=400,
            code="INVALID_PHONE",
            message="Số điện thoại không hợp lệ (cần 8-15 chữ số).",
        )

    password = payload.password or ""
    if len(password) < 8 or len(password) > 256:
        raise ApiError(
            status_code=400,
            code="WEAK_PASSWORD",
            message="Mật khẩu phải có từ 8 đến 256 ký tự.",
        )

    owner = payload.owner.strip() or "Chủ hộ kinh doanh"
    shop_name = payload.name.strip() or "Hộ kinh doanh cá thể"
    tax_code = payload.tax_code.strip()
    address = payload.address.strip() or "TP. Hồ Chí Minh"

    async with _get_register_lock(norm_phone):
        if repo.get_user_by_phone(norm_phone) is not None:
            raise ApiError(
                status_code=409,
                code="PHONE_ALREADY_REGISTERED",
                message="Số điện thoại này đã được đăng ký. Vui lòng chuyển sang tab Đăng nhập.",
            )

        hid = f"hh_{secrets.token_hex(8)}"
        salt_hex, hash_hex = await asyncio.to_thread(_hash_password, password)

        repo.save_user(
            norm_phone,
            {
                "phone": norm_phone,
                "display_phone": payload.phone.strip(),
                "household_id": hid,
                "salt": salt_hex,
                "password_hash": hash_hex,
                "owner": owner,
            },
        )

        hh_info = {
            "id": hid,
            "name": shop_name,
            "owner": owner,
            "phone": payload.phone.strip(),
            "tax_code": tax_code,
            "address": address,
            "email": "",
            "picture": "",
            "auth_method": "password",
        }
        repo.save_household(hid, hh_info)
    token = create_session_token(
        household_id=hid,
        owner=owner,
        email="",
        auth_method="password",
    )
    set_session_cookie(response, request, token)
    return {
        "status": "ok",
        "household": hh_info,
        "message": f"Đã đăng ký thành công tài khoản {owner} ({shop_name})!",
    }


@router.post("/auth/login")
async def login_household(
    payload: LoginRequest,
    request: Request,
    response: Response,
) -> dict[str, object]:
    if not settings.demo_mode and payload.auth_method == "preset":
        raise ApiError(
            status_code=403,
            code="DEMO_DISABLED",
            message="Tài khoản mẫu bị tắt ở chế độ Production. Vui lòng đăng ký hoặc đăng nhập bằng tài khoản riêng / Google.",
        )

    norm_phone = _normalize_phone(payload.phone)
    provided_pw = payload.password or ""

    # Preset stage demo (allowed only when DEMO_MODE=true)
    if settings.demo_mode and payload.auth_method == "preset":
        hid = settings.demo_household_id
        owner = payload.owner.strip() or "Nguyễn Minh Tâm"
        shop_name = payload.name.strip() or "Cửa hàng Thương mại & Dịch vụ Minh Tâm"
        tax_code = payload.tax_code.strip() or "0316889912"
        hh_info = {
            "id": hid,
            "name": shop_name,
            "owner": owner,
            "phone": payload.phone.strip() or "0909 123 456",
            "tax_code": tax_code,
            "address": payload.address.strip() or "TP. Hồ Chí Minh",
            "email": payload.email or "",
            "picture": payload.picture or "",
            "auth_method": "preset",
        }
        repo.save_household(hid, hh_info)
        token = create_session_token(
            household_id=hid,
            owner=owner,
            email=payload.email or "",
            auth_method="preset",
        )
        set_session_cookie(response, request, token)
        return {
            "status": "ok",
            "household": hh_info,
            "message": f"Xin chào {owner} ({shop_name})!",
        }

    # Registered account authentication (required in Production; also supported in Demo mode)
    fail_key = f"acct_fail:{norm_phone}" if norm_phone else ""
    if fail_key:
        acct_blocked, retry_after = rate_limiter.is_blocked(
            fail_key,
            limit=_ACCOUNT_MAX_FAILS,
            window_seconds=_ACCOUNT_LOCK_SECONDS,
        )
        if acct_blocked:
            raise ApiError(
                status_code=429,
                code="ACCOUNT_TEMPORARILY_LOCKED",
                message=(
                    f"Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá {_ACCOUNT_MAX_FAILS} lần. "
                    f"Vui lòng thử lại sau {retry_after} giây."
                ),
            )

    user = repo.get_user_by_phone(norm_phone) if norm_phone else None
    if not settings.demo_mode:
        if payload.auth_method not in {"phone", "password"}:
            raise ApiError(
                status_code=401,
                code="INVALID_AUTH_METHOD",
                message="Phương thức đăng nhập không hợp lệ.",
            )
        if not user:
            # Constant-time work even when account does not exist
            await asyncio.to_thread(_verify_password, provided_pw or "invalid", _DUMMY_SALT_HEX, _DUMMY_HASH_HEX)
            if fail_key:
                rate_limiter.record_hit(fail_key, _ACCOUNT_LOCK_SECONDS)
            raise ApiError(
                status_code=401,
                code="INVALID_CREDENTIALS",
                message="Số điện thoại hoặc mật khẩu không chính xác.",
            )
        if not await asyncio.to_thread(_verify_password, provided_pw, user["salt"], user["password_hash"]):
            if fail_key:
                rate_limiter.record_hit(fail_key, _ACCOUNT_LOCK_SECONDS)
            raise ApiError(
                status_code=401,
                code="INVALID_CREDENTIALS",
                message="Số điện thoại hoặc mật khẩu không chính xác.",
            )
    else:
        # In DEMO_MODE=true: if matching user exists with password, verify and use their isolated hid;
        # otherwise allow passwordless demo preview isolated only to registered-or-demo showcase.
        if user:
            if not await asyncio.to_thread(_verify_password, provided_pw, user["salt"], user["password_hash"]):
                if fail_key:
                    rate_limiter.record_hit(fail_key, _ACCOUNT_LOCK_SECONDS)
                raise ApiError(
                    status_code=401,
                    code="INVALID_CREDENTIALS",
                    message="Mật khẩu không chính xác.",
                )
        elif not payload.owner.strip() and not norm_phone:
            raise ApiError(
                status_code=400,
                code="MISSING_LOGIN_INFO",
                message="Vui lòng nhập thông tin đăng nhập.",
            )

    if fail_key and user:
        rate_limiter.clear_key(fail_key)

    if user:
        hid = user["household_id"]
        hh_info = repo.households.get(hid) or {
            "id": hid,
            "name": payload.name.strip() or "Hộ kinh doanh cá thể",
            "owner": user.get("owner") or payload.owner.strip() or "Chủ hộ kinh doanh",
            "phone": user.get("display_phone") or payload.phone.strip(),
            "tax_code": payload.tax_code.strip(),
            "address": payload.address.strip() or "TP. Hồ Chí Minh",
            "email": "",
            "picture": "",
            "auth_method": "password",
        }
        repo.save_household(hid, hh_info)
        auth_method = "password"
    else:
        # Only reachable when settings.demo_mode is True
        hid = settings.demo_household_id
        hh_info = {
            "id": hid,
            "name": payload.name.strip() or "Cửa hàng Thương mại & Dịch vụ Minh Tâm",
            "owner": payload.owner.strip() or "Nguyễn Minh Tâm",
            "phone": payload.phone.strip() or "0909 123 456",
            "tax_code": payload.tax_code.strip() or "0316889912",
            "address": payload.address.strip() or "TP. Hồ Chí Minh",
            "email": payload.email or "",
            "picture": payload.picture or "",
            "auth_method": "demo",
        }
        repo.save_household(hid, hh_info)
        auth_method = "demo"

    token = create_session_token(
        household_id=hid,
        owner=str(hh_info["owner"]),
        email=str(hh_info.get("email", "")),
        auth_method=auth_method,
    )
    set_session_cookie(response, request, token)
    return {
        "status": "ok",
        "household": hh_info,
        "message": f"Xin chào {hh_info['owner']} ({hh_info['name']})!",
    }


@router.post("/auth/google")
async def login_with_google(
    payload: GoogleOAuthLoginRequest,
    request: Request,
    response: Response,
) -> dict[str, object]:
    """Verify Google OAuth2 access_token or ID token JWT (checking aud & email_verified) and derive isolated household ID from sub/email."""
    user_sub = ""
    user_email = ""
    user_name = ""
    user_picture = ""
    expected_cid = (settings.google_client_id or os.environ.get("GOOGLE_CLIENT_ID", "")).strip()

    if payload.access_token:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {payload.access_token}"},
            )
            if resp.status_code != 200:
                raise ApiError(
                    status_code=401,
                    code="INVALID_GOOGLE_TOKEN",
                    message="Không thể xác thực access_token Google OAuth2. Vui lòng thử lại.",
                )
            info = resp.json()
            if expected_cid and ("aud" in info or "azp" in info):
                if info.get("aud") != expected_cid and info.get("azp") != expected_cid:
                    raise ApiError(
                        status_code=401,
                        code="GOOGLE_AUDIENCE_MISMATCH",
                        message="Token Google không khớp với Google Client ID của hệ thống.",
                    )
            if not _is_truthy_verified(info.get("email_verified")):
                raise ApiError(
                    status_code=401,
                    code="UNVERIFIED_GOOGLE_EMAIL",
                    message="Email Google chưa được xác minh (email_verified).",
                )
            user_sub = str(info.get("sub", "")).strip()
            user_email = str(info.get("email", "")).strip().lower()
            user_name = str(info.get("name", "")).strip()
            user_picture = str(info.get("picture", "")).strip()
            if not user_email and not user_sub:
                raise ApiError(
                    status_code=401,
                    code="MISSING_GOOGLE_IDENTITY",
                    message="Token Google thiếu thông tin định danh email/sub.",
                )

    elif payload.credential:
        if not settings.demo_mode and not expected_cid:
            raise ApiError(
                status_code=401,
                code="GOOGLE_CLIENT_ID_NOT_CONFIGURED",
                message="Hệ thống Production chưa cấu hình GOOGLE_CLIENT_ID để đối chiếu chữ ký aud.",
            )
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": payload.credential},
            )
            if resp.status_code != 200:
                raise ApiError(
                    status_code=401,
                    code="INVALID_GOOGLE_JWT",
                    message="ID Token Google không hợp lệ hoặc đã hết hạn.",
                )
            info = resp.json()
            if expected_cid and info.get("aud") != expected_cid and info.get("azp") != expected_cid:
                raise ApiError(
                    status_code=401,
                    code="GOOGLE_AUDIENCE_MISMATCH",
                    message="Token Google không khớp với Google Client ID của hệ thống.",
                )
            if not _is_truthy_verified(info.get("email_verified")):
                raise ApiError(
                    status_code=401,
                    code="UNVERIFIED_GOOGLE_EMAIL",
                    message="Email Google chưa được xác minh (email_verified).",
                )
            user_sub = str(info.get("sub", "")).strip()
            user_email = str(info.get("email", "")).strip().lower()
            user_name = str(info.get("name", "")).strip()
            user_picture = str(info.get("picture", "")).strip()
            if not user_email and not user_sub:
                raise ApiError(
                    status_code=401,
                    code="MISSING_GOOGLE_IDENTITY",
                    message="ID Token Google thiếu thông tin định danh email/sub.",
                )

    else:
        if not settings.demo_mode:
            raise ApiError(
                status_code=401,
                code="GOOGLE_TOKEN_REQUIRED",
                message="Yêu cầu xác thực Google OAuth token hợp lệ trong chế độ Production.",
            )
        user_email = (payload.email or "").strip().lower()
        user_name = (payload.name or "").strip()
        user_picture = (payload.picture or "").strip()

    if not user_email and not user_name and not user_sub:
        raise ApiError(
            status_code=400,
            code="MISSING_GOOGLE_PROFILE",
            message="Thiếu thông tin tài khoản Google.",
        )

    owner_display = user_name or (user_email.split("@")[0] if user_email else "Google User")
    identity_key = user_sub or user_email or owner_display.lower()
    hid = f"gg_{hashlib.sha256(identity_key.encode('utf-8')).hexdigest()[:12]}"

    hh_info = {
        "id": hid,
        "name": payload.shop_name,
        "owner": owner_display,
        "phone": "",
        "tax_code": payload.tax_code.strip(),
        "address": payload.address,
        "email": user_email,
        "picture": user_picture,
        "auth_method": "google",
    }
    repo.save_household(hid, hh_info)
    token = create_session_token(
        household_id=hid,
        owner=owner_display,
        email=user_email,
        auth_method="google",
    )
    set_session_cookie(response, request, token)
    return {
        "status": "ok",
        "household": hh_info,
        "message": f"Đã đăng nhập bằng Google: {owner_display} ({user_email})!",
    }


@router.post("/auth/logout")
async def logout_household(request: Request, response: Response) -> dict[str, str]:
    for tok in extract_all_tokens(request):
        revoke_session_token(tok)
    clear_session_cookie(response)
    return {"status": "ok", "message": "Đã đăng xuất và thu hồi phiên an toàn."}


@router.post("/settings/google-client-id")
async def update_google_client_id(
    payload: GoogleClientIdUpdateRequest,
    _admin: dict[str, Any] = Depends(require_admin_or_demo),
) -> dict[str, object]:
    clean_id = payload.google_client_id.strip()
    settings.google_client_id = clean_id
    os.environ["GOOGLE_CLIENT_ID"] = clean_id
    return {
        "status": "ok",
        "google_client_id": clean_id,
        "message": "Đã lưu Google OAuth Client ID thành công!",
    }


@router.post("/demo/reset")
async def reset_demo_data(
    _admin: dict[str, Any] = Depends(require_admin_or_demo),
) -> dict[str, str]:
    repo.reset_to_seed()
    return {
        "status": "ok",
        "message": "Đã khôi phục dữ liệu mẫu Cửa hàng Thương mại & Dịch vụ Minh Tâm.",
    }


@router.get("/settings/status")
async def get_settings_status(request: Request) -> dict[str, object]:
    session = get_optional_session(request)
    active_key = bool(settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "").strip())
    hid = str(session.get("hid", "demo")) if session else "demo"
    return {
        "authenticated": bool(session),
        "demo_mode": settings.demo_mode,
        "gemini_configured": active_key,
        "gemini_model": settings.gemini_model,
        "google_client_id": settings.google_client_id or os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
        "gcp_project": settings.gcp_project or None,
        "household": repo.get_household(hid) if session else None,
        "lan_urls": _get_lan_urls(settings.port) if settings.demo_mode else [],
    }


@router.delete("/settings/apikey")
async def clear_gemini_apikey(
    _admin: dict[str, Any] = Depends(require_admin_or_demo),
) -> dict[str, object]:
    settings.gemini_api_key = ""
    os.environ.pop("GEMINI_API_KEY", None)
    return {
        "status": "ok",
        "gemini_configured": False,
        "message": "Đã xóa khóa Gemini API khỏi bộ nhớ phiên.",
    }


@router.patch("/household/profile")
async def update_household_profile(
    payload: HouseholdProfileUpdateRequest,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, object]:
    hid = str(session.get("hid", "demo"))
    existing = dict(repo.get_household(hid) or {})
    updated = {
        **existing,
        "id": hid,
        "name": payload.name.strip() or existing.get("name", "Hộ kinh doanh cá thể"),
        "owner": payload.owner.strip() or existing.get("owner", "Chủ hộ kinh doanh"),
        "tax_code": payload.tax_code.strip(),
        "address": payload.address.strip(),
        "phone": payload.phone.strip() or existing.get("phone", ""),
        "business_sector": payload.business_sector.strip() or "Thương mại & Dịch vụ tổng hợp",
        "revenue_tier": payload.revenue_tier,
        "tax_method": payload.tax_method,
    }
    saved = repo.save_household(hid, updated)
    return {
        "status": "ok",
        "household": saved,
        "message": "Đã cập nhật hồ sơ hộ kinh doanh thành công!",
    }


@router.post("/auth/change-password")
async def change_account_password(
    payload: PasswordChangeRequest,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, str]:
    hid = str(session.get("hid", ""))
    user_key = next(
        (k for k, u in repo.users.items() if u.get("household_id") == hid),
        None,
    )
    if not user_key:
        raise ApiError(
            status_code=400,
            code="PASSWORD_NOT_APPLICABLE",
            message="Tài khoản đăng nhập qua Google hoặc chế độ Demo không sử dụng mật khẩu SĐT.",
        )

    user = repo.users[user_key]
    pw_ok = await asyncio.to_thread(
        _verify_password,
        payload.current_password,
        user.get("salt", ""),
        user.get("password_hash", ""),
    )
    if not pw_ok:
        raise ApiError(
            status_code=401,
            code="INVALID_CURRENT_PASSWORD",
            message="Mật khẩu hiện tại không đúng.",
        )

    if len(payload.new_password or "") < 8 or len(payload.new_password or "") > 256:
        raise ApiError(
            status_code=400,
            code="WEAK_PASSWORD",
            message="Mật khẩu mới phải có từ 8 đến 256 ký tự.",
        )

    new_salt, new_hash = await asyncio.to_thread(_hash_password, payload.new_password)
    updated_user = {**user, "salt": new_salt, "password_hash": new_hash}
    repo.save_user(user_key, updated_user)
    return {"status": "ok", "message": "Đã đổi mật khẩu thành công!"}


@router.get("/household/backup")
async def export_household_backup(
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, object]:
    hid = str(session.get("hid", "demo"))
    hh = repo.get_household(hid)
    all_txs = [
        t.model_dump()
        for t in repo.transactions.values()
        if t.household_id == hid
    ]
    locks = {
        k: v
        for k, v in repo.locked_periods.items()
        if k.startswith(f"{hid}:")
    }
    return {
        "household": hh,
        "transactions": all_txs,
        "locked_periods": locks,
    }


@router.post("/settings/apikey")
async def update_gemini_apikey(
    payload: ApiKeyUpdateRequest,
    _admin: dict[str, Any] = Depends(require_admin_or_demo),
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
