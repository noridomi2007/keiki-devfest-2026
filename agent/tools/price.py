from __future__ import annotations

import statistics
from agent.normalize import normalize_text
from agent.schemas import ExtractionResult, Repository, Warning


async def compare_price_history(
    ext: ExtractionResult,
    repo: Repository,
    household_id: str,
    threshold: float = 0.30,
) -> list[Warning]:
    """Compare each item's unit_price_vnd against median of up to 10 historical prices."""
    if not ext.items:
        return []

    warnings: list[Warning] = []
    cp_norm = normalize_text(ext.counterparty) or None

    for item in ext.items:
        item_norm = normalize_text(item.name)
        if not item_norm or item.unit_price_vnd <= 0:
            continue

        points = await repo.price_history(
            household_id=household_id,
            item_norm=item_norm,
            counterparty_norm=cp_norm,
            limit=10,
        )
        if len(points) < 3:
            continue

        hist_prices = [p.unit_price_vnd for p in points if p.unit_price_vnd > 0]
        if len(hist_prices) < 3:
            continue

        med = int(round(statistics.median(hist_prices)))
        if med <= 0:
            continue

        deviation = abs(item.unit_price_vnd - med) / med
        if deviation > threshold:
            pct = int(round(deviation * 100))
            direction = "cao hơn" if item.unit_price_vnd > med else "thấp hơn"
            med_fmt = f"{med:,}".replace(",", ".")
            cur_fmt = f"{item.unit_price_vnd:,}".replace(",", ".")
            warnings.append(
                Warning(
                    code="PRICE_ANOMALY",
                    severity="medium",
                    message=(
                        f"Đơn giá '{item.name}' ({cur_fmt} đ) {direction} {pct}% so với "
                        f"trung vị {len(hist_prices)} lần nhập trước ({med_fmt} đ)."
                    ),
                )
            )
    return warnings
