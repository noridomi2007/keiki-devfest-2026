from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from agent.schemas import (
    AgentSettings,
    DocumentRef,
    ExtractionResult,
)

PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_prompt(name: str) -> str:
    path = PROMPTS_DIR / name
    if path.exists():
        return path.read_text(encoding="utf-8")
    return "Hãy trích xuất thông tin chứng từ kế toán hộ kinh doanh Việt Nam theo đúng JSON schema."


async def extract_from_image(doc: DocumentRef, settings: AgentSettings) -> ExtractionResult:
    """Call Google Gemini Multimodal API (google-genai) with Structured Outputs."""
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
    candidate_models = [primary_model, "gemini-3.5-flash-lite"]
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
            if attempt == 1:
                raise RuntimeError(f"Lỗi khi gọi Google Gemini Vision đọc chứng từ: {exc}") from exc
    raise RuntimeError("Không thể trích xuất chứng từ qua Google Gemini Vision.")
