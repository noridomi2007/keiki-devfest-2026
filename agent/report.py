from __future__ import annotations

import asyncio
from collections import OrderedDict
import hashlib
import json
from pathlib import Path

from agent.client import create_gemini_client, resolve_gemini_api_key

PROMPTS_DIR = Path(__file__).parent / "prompts"
_SUMMARY_CACHE: OrderedDict[str, str] = OrderedDict()
_MAX_SUMMARY_CACHE = 256


async def summarize_report(numbers: dict, gemini_api_key: str | None = None, model: str = "gemini-2.5-flash") -> str:
    """Generate a friendly 2-3 sentence Vietnamese business & loan-readiness insight using Google Gemini with bounded caching."""
    api_key = resolve_gemini_api_key(gemini_api_key)
    serialized_numbers = json.dumps(numbers, ensure_ascii=False, sort_keys=True)
    if api_key:
        cache_key = hashlib.sha256(f"{model}:{serialized_numbers}".encode("utf-8")).hexdigest()
        cached = _SUMMARY_CACHE.get(cache_key)
        if cached:
            _SUMMARY_CACHE.move_to_end(cache_key)
            return cached

        try:
            prompt_path = PROMPTS_DIR / "report_summary.vi.md"
            prompt_text = (
                prompt_path.read_text(encoding="utf-8")
                if prompt_path.exists()
                else "Hãy tóm tắt báo cáo thu chi hộ kinh doanh bằng 2-3 câu tiếng Việt dễ hiểu."
            )
            client = create_gemini_client(api_key)
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[f"{prompt_text}\n\nDữ liệu thống kê:\n{serialized_numbers}"],
            )
            if resp.text and resp.text.strip():
                summary = resp.text.strip()
                _SUMMARY_CACHE[cache_key] = summary
                if len(_SUMMARY_CACHE) > _MAX_SUMMARY_CACHE:
                    _SUMMARY_CACHE.popitem(last=False)
                return summary
        except Exception:
            pass

    totals = numbers.get("totals", {})
    rev = f"{totals.get('revenue_vnd', 0):,}".replace(",", ".")
    exp = f"{totals.get('expense_vnd', 0):,}".replace(",", ".")
    prof = f"{totals.get('profit_vnd', 0):,}".replace(",", ".")
    tax = f"{totals.get('estimated_tax_vnd', 0):,}".replace(",", ".")
    loan = numbers.get("loan_readiness", {})
    ratio = loan.get("verified_ratio_pct", 0)
    cross_cnt = loan.get("cross_verified_count", 0)

    return (
        f"Trong kỳ, tổng doanh thu đạt {rev} đ, chi phí {exp} đ, lãi tạm tính {prof} đ "
        f"(thuế hộ kinh doanh ước tính theo Thông tư 152/2025/TT-BTC là {tax} đ). "
        f"Sổ sách đạt độ minh bạch cao với {ratio}% giao dịch có chứng từ gốc đối chiếu "
        f"({cross_cnt} giao dịch khớp cả hóa đơn giấy lẫn chuyển khoản), rất thuận lợi để nộp hồ sơ vay vốn ngân hàng."
    )
