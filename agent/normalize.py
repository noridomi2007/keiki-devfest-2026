from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from agent.schemas import ExtractionResult


VIET_NUMBERS = {
    "không": 0,
    "một": 1,
    "mốt": 1,
    "hai": 2,
    "ba": 3,
    "bốn": 4,
    "tư": 4,
    "năm": 5,
    "lăm": 5,
    "sáu": 6,
    "bảy": 7,
    "tám": 8,
    "chín": 9,
    "mười": 10,
}


def normalize_text(text: str | None) -> str:
    """Lowercase, strip Vietnamese accents, remove special chars, collapse whitespace."""
    if not text:
        return ""
    s = text.strip().lower()
    s = s.replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_vnd_amount(raw: int | float | str | None) -> int | None:
    """Parse Vietnamese currency expressions and Central dialect slang into integer VND."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw if raw > 0 else None
    if isinstance(raw, float):
        return int(round(raw)) if raw > 0 else None

    s = str(raw).strip().lower()
    if not s:
        return None

    # Clean common currency suffixes
    s_clean = s.replace("vnđ", "").replace("vnd", "").replace("đồng", "").replace("đ", "").strip()

    # Pure digits or dot/comma separated thousands: "1.250.000", "650,000"
    if re.fullmatch(r"[\d\.,\s]+", s_clean):
        digits_only = re.sub(r"[^\d]", "", s_clean)
        if digits_only:
            val = int(digits_only)
            return val if val > 0 else None

    # Shorthand with decimal + unit: "1,25 triệu", "1.5 tr", "3.2 củ", "6,5 xị", "600k"
    m_unit = re.search(
        r"(\d+(?:[\.,]\d+)?)\s*(triệu|tr|củ|chai|xị|lít|chục|ngàn|nghìn|k)\b(?:\s*(\d+|rưỡi))?",
        s,
    )
    if m_unit:
        num_str = m_unit.group(1).replace(",", ".")
        unit = m_unit.group(2)
        tail = m_unit.group(3)
        base_mult = {
            "triệu": 1_000_000,
            "tr": 1_000_000,
            "củ": 1_000_000,
            "chai": 1_000_000,
            "xị": 100_000,
            "lít": 100_000,
            "chục": 10_000,
            "ngàn": 1_000,
            "nghìn": 1_000,
            "k": 1_000,
        }[unit]
        val = float(num_str) * base_mult
        if tail == "rưỡi":
            val += 0.5 * base_mult
        elif tail and tail.isdigit():
            # e.g. "3 triệu 2" -> 3_200_000; "6 trăm 4" handled below
            scale = base_mult // (10 ** len(tail))
            val += int(tail) * scale
        return int(round(val))

    # Spoken Central / Vietnamese words: e.g. "bảy trăm rưỡi ngàn", "sáu trăm tư", "tám trăm ngàn", "hai củ rưỡi"
    m_hundreds = re.search(
        r"(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|\d+)\s*trăm(?:\s*(rưỡi|mốt|hai|ba|bốn|tư|lăm|sáu|bảy|tám|chín|\d+))?(?:\s*(ngàn|nghìn))?",
        s,
    )
    if m_hundreds:
        h_tok = m_hundreds.group(1)
        t_tok = m_hundreds.group(2)
        h_val = int(h_tok) if h_tok.isdigit() else VIET_NUMBERS.get(h_tok, 0)
        total_k = h_val * 100
        if t_tok == "rưỡi":
            total_k += 50
        elif t_tok:
            t_val = int(t_tok) if t_tok.isdigit() else VIET_NUMBERS.get(t_tok, 0)
            total_k += t_val * 10
        return total_k * 1000

    m_spoken_unit = re.search(
        r"(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(triệu|củ|chai|xị|lít|chục)(?:\s*(rưỡi|mốt|hai|ba|bốn|tư|lăm|sáu|bảy|tám|chín))?",
        s,
    )
    if m_spoken_unit:
        n_val = VIET_NUMBERS[m_spoken_unit.group(1)]
        u_str = m_spoken_unit.group(2)
        tail_tok = m_spoken_unit.group(3)
        mult = {
            "triệu": 1_000_000,
            "củ": 1_000_000,
            "chai": 1_000_000,
            "xị": 100_000,
            "lít": 100_000,
            "chục": 10_000,
        }[u_str]
        total = n_val * mult
        if tail_tok == "rưỡi":
            total += mult // 2
        elif tail_tok in VIET_NUMBERS:
            total += VIET_NUMBERS[tail_tok] * (mult // 10)
        return total

    return None


def normalize_date(raw: str | None, reference_date: date | None = None) -> str | None:
    """Normalize Vietnamese dates and Central dialect time words ('sáng ni', 'bữa qua') to YYYY-MM-DD."""
    ref = reference_date or date(2026, 11, 12)
    if not raw:
        return None
    s = raw.strip().lower()
    if any(k in s for k in ["bữa ni", "hôm ni", "sáng ni", "trưa ni", "chiều ni", "tối ni", "hôm nay", "bây chừ"]):
        return ref.isoformat()
    if any(k in s for k in ["bữa qua", "hôm qua"]):
        return (ref - timedelta(days=1)).isoformat()

    # Already ISO YYYY-MM-DD
    m_iso = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m_iso:
        try:
            d = date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
            return d.isoformat()
        except ValueError:
            return None

    # DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
    m_vn = re.match(r"^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$", s)
    if m_vn:
        day, month, year = int(m_vn.group(1)), int(m_vn.group(2)), int(m_vn.group(3))
        if year < 100:
            year += 2000
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None

    return None


def normalize_extraction(ext: ExtractionResult, reference_date: date | None = None) -> ExtractionResult:
    """Normalize all fields inside ExtractionResult in-place/copy."""
    ref = reference_date or date(2026, 11, 12)
    norm_date = normalize_date(ext.date, ref)
    if not norm_date and ext.transcript:
        norm_date = normalize_date(ext.transcript, ref)
    if not norm_date:
        norm_date = ref.isoformat()

    norm_amount = parse_vnd_amount(ext.amount_vnd)
    if norm_amount is None and ext.transcript:
        norm_amount = parse_vnd_amount(ext.transcript)

    counterparty = ext.counterparty.strip() if ext.counterparty else None
    tax_code = re.sub(r"\s+", "", ext.tax_code) if ext.tax_code else None

    return ext.model_copy(
        update={
            "date": norm_date,
            "amount_vnd": norm_amount,
            "counterparty": counterparty,
            "tax_code": tax_code,
        }
    )
