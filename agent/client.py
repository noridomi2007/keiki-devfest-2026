from __future__ import annotations

import os
from typing import Any


def resolve_gemini_api_key(explicit_key: str | None = None) -> str:
    """Resolve active Gemini API key from explicit config or environment."""
    return (explicit_key or os.environ.get("GEMINI_API_KEY", "")).strip()


def create_gemini_client(api_key: str) -> Any:
    """
    Create a configured google-genai Client supporting both:
    - Google AI Studio API keys (AIzaSy...)
    - Google Cloud Vertex AI Express Mode API keys (AQ....)
    """
    from google import genai

    clean_key = api_key.strip()
    is_vertex_express = clean_key.startswith("AQ.") or None
    return genai.Client(vertexai=is_vertex_express, api_key=clean_key)
