from __future__ import annotations

import os
from typing import Any

DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"
_DEPRECATED_MODEL_ALIASES = {
    "gemini-2.5-flash": DEFAULT_GEMINI_MODEL,
    "models/gemini-2.5-flash": DEFAULT_GEMINI_MODEL,
    "gemini-2.5-flash-lite": DEFAULT_GEMINI_MODEL,
    "models/gemini-2.5-flash-lite": DEFAULT_GEMINI_MODEL,
    "gemini-3.8-flash": DEFAULT_GEMINI_MODEL,
    "models/gemini-3.8-flash": DEFAULT_GEMINI_MODEL,
}


def resolve_gemini_api_key(explicit_key: str | None = None) -> str:
    """Resolve active Gemini API key from explicit config or environment."""
    return (explicit_key or os.environ.get("GEMINI_API_KEY", "")).strip()


def resolve_gemini_model(explicit_model: str | None = None) -> str:
    """Resolve active Gemini model and upgrade deprecated/slow aliases automatically."""
    raw = (explicit_model or os.environ.get("GEMINI_MODEL", "") or DEFAULT_GEMINI_MODEL).strip()
    return _DEPRECATED_MODEL_ALIASES.get(raw, raw)


def create_gemini_client(api_key: str) -> Any:
    """
    Create a configured google-genai Client supporting both:
    - Google AI Studio API keys (AIzaSy...)
    - Google Cloud account-bound Gemini API keys (AQ....) via generativelanguage.googleapis.com
    with a bounded 20-second request timeout so requests never hang.
    """
    from google import genai
    from google.genai import types

    clean_key = api_key.strip()
    return genai.Client(
        vertexai=False,
        api_key=clean_key,
        http_options=types.HttpOptions(timeout=20000),
    )
