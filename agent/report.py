from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"


async def summarize_report(numbers: dict, gemini_api_key: str | None = None, model: str = "gemini-2.5-flash") -> str:
    """Generate a friendly 2-3 sentence Vietnamese business & loan-readiness insight using Google Gemini."""
    api_key = gemini_api_key or os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key:
        try:
            from google import genai

            prompt_path = PROMPTS_DIR / "report_summary.vi.md"
            prompt_text = (
                prompt_path.read_text(encoding="utf-8")
                if prompt_path.exists()
                else "Hãy tóm tắt báo cáo thu chi hộ kinh doanh bằng 2-3 câu tiếng Việt dễ hiểu."
            )
            client = genai.Client(api_key=api_key)
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[f"{prompt_text}\n\nDữ liệu thống kê:\n{json.dumps(numbers, ensure_ascii=False)}"],
            )
            if resp.text and resp.text.strip():
                return resp.text.strip()
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
