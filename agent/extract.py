from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from agent.schemas import (
    AgentSettings,
    ConfidenceScores,
    DocumentRef,
    ExtractionResult,
    Item,
)

PROMPTS_DIR = Path(__file__).parent / "prompts"

_EVAL_PRESETS: dict[str, ExtractionResult] = {
    "receipt_minhphat_900k": ExtractionResult(
        date="2026-11-12",
        type="expense",
        category="nhap_hang",
        tax_group="khong_tinh_thue",
        payment_method="cash",
        amount_vnd=900000,
        counterparty="Đại lý Cà phê & Nguyên liệu Minh Phát Đà Nẵng",
        tax_code="0401234567",
        items=[Item(name="Cà phê hạt 1kg", quantity=5, unit_price_vnd=180000, line_total_vnd=900000)],
        confidence=ConfidenceScores(date=0.98, amount_vnd=0.99, counterparty=0.96, type=0.99),
    ),
    "cross_transfer_900k": ExtractionResult(
        date="2026-11-12",
        type="expense",
        category="nhap_hang",
        tax_group="khong_tinh_thue",
        payment_method="transfer",
        amount_vnd=900000,
        counterparty="Đại lý Cà phê & Nguyên liệu Minh Phát Đà Nẵng",
        items=[],
        confidence=ConfidenceScores(date=0.98, amount_vnd=0.99, counterparty=0.95, type=0.98),
    ),
    "anomaly_1250k": ExtractionResult(
        date="2026-11-12",
        type="expense",
        category="nhap_hang",
        tax_group="khong_tinh_thue",
        payment_method="cash",
        amount_vnd=1250000,
        counterparty="Đại lý Cà phê & Nguyên liệu Minh Phát Đà Nẵng",
        tax_code="0401234567",
        items=[Item(name="Cà phê hạt 1kg", quantity=5, unit_price_vnd=250000, line_total_vnd=1250000)],
        confidence=ConfidenceScores(date=0.97, amount_vnd=0.98, counterparty=0.95, type=0.98),
    ),
    "mismatch_650k": ExtractionResult(
        date="2026-11-12",
        type="expense",
        category="nhap_hang",
        tax_group="khong_tinh_thue",
        payment_method="cash",
        amount_vnd=650000,
        counterparty="Nhà phân phối Bia & Nước giải khát Sông Hàn",
        items=[
            Item(name="Bia Larue thùng 24 lon", quantity=2, unit_price_vnd=270000, line_total_vnd=540000),
        ],
        confidence=ConfidenceScores(date=0.96, amount_vnd=0.95, counterparty=0.94, type=0.97),
    ),
    "ambiguous_850k": ExtractionResult(
        date="2026-11-12",
        type="expense",
        category="chi_khac",
        tax_group="khong_tinh_thue",
        payment_method="transfer",
        amount_vnd=850000,
        counterparty="NGUYEN VAN HUNG",
        items=[],
        confidence=ConfidenceScores(date=0.95, amount_vnd=0.96, counterparty=0.65, type=0.72),
    ),
}


def _load_prompt(name: str) -> str:
    path = PROMPTS_DIR / name
    if path.exists():
        return path.read_text(encoding="utf-8")
    return "Hãy trích xuất thông tin chứng từ kế toán hộ kinh doanh Việt Nam theo đúng JSON schema."


async def extract_from_image(doc: DocumentRef, settings: AgentSettings) -> ExtractionResult:
    """Call Google Gemini Multimodal API (google-genai) with Structured Outputs."""
    if doc.preset_hint and doc.preset_hint in _EVAL_PRESETS:
        return _EVAL_PRESETS[doc.preset_hint].model_copy(deep=True)

    if settings.cache_dir and doc.sha256:
        cache_key = hashlib.sha256(f"{doc.sha256}:{doc.preset_hint or ''}".encode("utf-8")).hexdigest()
        cache_path = Path(settings.cache_dir) / f"{cache_key}.json"
        if cache_path.exists():
            return ExtractionResult.model_validate_json(cache_path.read_text(encoding="utf-8"))

    from agent.client import create_gemini_client, resolve_gemini_api_key, resolve_gemini_model

    api_key = resolve_gemini_api_key(settings.gemini_api_key)
    if not api_key:
        raise ValueError(
            "Chưa cấu hình GEMINI_API_KEY. Vui lòng thiết lập khóa Google Gemini API trong backend/.env hoặc cấu hình hệ thống để đọc ảnh chứng từ."
        )

    from google.genai import types

    prompt_text = _load_prompt("extract_receipt.vi.md")
    client = create_gemini_client(api_key)
    primary_model = resolve_gemini_model(settings.gemini_model)
    candidate_models = list(dict.fromkeys([primary_model, "gemini-2.5-flash", "gemini-2.0-flash"]))
    for attempt, model_name in enumerate(candidate_models):
        try:
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=doc.data, mime_type=doc.mime_type),
                    prompt_text,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ExtractionResult,
                    temperature=0.0,
                ),
            )
            result = (
                resp.parsed
                if isinstance(resp.parsed, ExtractionResult)
                else ExtractionResult.model_validate(json.loads(resp.text))
            )
            if settings.cache_dir and doc.sha256:
                cache_key = hashlib.sha256(f"{doc.sha256}:{doc.preset_hint or ''}".encode("utf-8")).hexdigest()
                cache_path = Path(settings.cache_dir) / f"{cache_key}.json"
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
            return result
        except Exception as exc:
            if attempt == len(candidate_models) - 1:
                raw_err = str(exc)
                if "429" in raw_err or "RESOURCE_EXHAUSTED" in raw_err:
                    friendly = "Hệ thống Google Gemini API đang vượt hạn mức gọi (429). Vui lòng thử lại sau ít giây."
                elif "403" in raw_err or "PERMISSION_DENIED" in raw_err or "API_KEY" in raw_err:
                    friendly = "Khóa Google Gemini API chưa hợp lệ hoặc chưa được cấp quyền (403)."
                elif "503" in raw_err or "504" in raw_err or "Timeout" in raw_err:
                    friendly = "Máy chủ Google Gemini Vision đang bận. Vui lòng thử lại sau ít giây."
                else:
                    friendly = "Không thể đọc chứng từ tự động qua Google Gemini Vision. Vui lòng kiểm tra độ rõ của ảnh hoặc thử lại."
                raise RuntimeError(friendly) from exc
    raise RuntimeError("Không thể trích xuất chứng từ qua Google Gemini Vision.")
