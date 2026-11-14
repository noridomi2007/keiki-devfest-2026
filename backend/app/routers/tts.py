from __future__ import annotations

import re
from typing import Any
import urllib.parse
import httpx
from fastapi import APIRouter, Depends, Query, Response

from backend.app.security import require_session

router = APIRouter(
    prefix="/api/tts",
    tags=["tts"],
    dependencies=[Depends(require_session)],
)


def _split_vietnamese_chunks(text: str, max_chars: int = 175) -> list[str]:
    """Split Vietnamese text by sentence/clause boundaries so each chunk fits Google Translate TTS limit."""
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]

    parts = re.split(r"(?<=[\.\!\?\;\,\:])\s+", cleaned)
    chunks: list[str] = []
    current = ""
    for part in parts:
        if not part:
            continue
        if len(current) + len(part) + 1 <= max_chars:
            current = f"{current} {part}".strip() if current else part
        else:
            if current:
                chunks.append(current)
            if len(part) <= max_chars:
                current = part
            else:
                words = part.split(" ")
                sub = ""
                for w in words:
                    if len(sub) + len(w) + 1 <= max_chars:
                        sub = f"{sub} {w}".strip() if sub else w
                    else:
                        if sub:
                            chunks.append(sub)
                        sub = w
                current = sub
    if current:
        chunks.append(current)
    return chunks


@router.get("")
async def google_vietnamese_tts(
    text: str = Query(..., min_length=1, max_length=1000),
    _session: dict[str, Any] = Depends(require_session),
) -> Response:
    """Authenticated Vietnamese TTS proxy returning MP3 audio."""
    chunks = _split_vietnamese_chunks(text)
    if not chunks:
        return Response(content=b"", media_type="audio/mpeg")

    audio_buffers: list[bytes] = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": "https://translate.google.com/",
    }

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
        for chunk in chunks:
            encoded_q = urllib.parse.quote(chunk)
            urls = [
                f"https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q={encoded_q}",
                f"https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q={encoded_q}",
            ]
            for url in urls:
                try:
                    resp = await client.get(url)
                    if resp.status_code == 200 and len(resp.content) > 256:
                        audio_buffers.append(resp.content)
                        break
                except Exception:
                    continue

    combined_mp3 = b"".join(audio_buffers)
    return Response(
        content=combined_mp3,
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )
