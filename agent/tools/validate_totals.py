from __future__ import annotations

from agent.schemas import ExtractionResult, Warning


def validate_totals(
    ext: ExtractionResult,
    tolerance_pct: float = 0.01,
    tolerance_min_vnd: int = 1000,
) -> list[Warning]:
    """Check if sum of item line totals matches invoice total amount_vnd."""
    if not ext.items or ext.amount_vnd is None or ext.amount_vnd <= 0:
        return []

    items_sum = sum(item.line_total_vnd for item in ext.items)
    diff = abs(items_sum - ext.amount_vnd)
    allowed = max(tolerance_min_vnd, int(ext.amount_vnd * tolerance_pct))

    if diff > allowed:
        return [
            Warning(
                code="TOTAL_MISMATCH",
                severity="high",
                message=(
                    f"Tổng các mặt hàng ({items_sum:,} đ) lệch {diff:,} đ so với tổng ghi trên chứng từ "
                    f"({ext.amount_vnd:,} đ).".replace(",", ".")
                ),
            )
        ]
    return []
