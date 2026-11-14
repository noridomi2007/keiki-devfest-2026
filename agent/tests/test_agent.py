from __future__ import annotations

import pytest
from agent.normalize import normalize_date, normalize_text, parse_vnd_amount
from agent.schemas import ConfidenceScores, ExtractionResult, Item
from agent.tools import (
    check_duplicate,
    classify_category_and_tax,
    compare_price_history,
    lookup_tax_code_warning,
    validate_totals,
)
from backend.app.repositories.memory import MemoryRepo


def test_parse_vnd_amount_vietnamese_formats():
    assert parse_vnd_amount("1.250.000đ") == 1_250_000
    assert parse_vnd_amount("1,25 triệu") == 1_250_000
    assert parse_vnd_amount("650k") == 650_000
    assert parse_vnd_amount("bảy trăm rưỡi ngàn") == 750_000
    assert parse_vnd_amount("sáu trăm tư") == 640_000
    assert parse_vnd_amount("tám trăm ngàn") == 800_000
    assert parse_vnd_amount("hai củ rưỡi") == 2_500_000
    assert parse_vnd_amount("sáu xị") == 600_000


def test_normalize_date_vietnamese():
    from datetime import date

    ref = date(2026, 11, 12)
    assert normalize_date("Hôm nay xuất bán 20 đơn hàng bán lẻ", ref) == "2026-11-12"
    assert normalize_date("Hôm qua nhập hàng", ref) == "2026-11-11"
    assert normalize_date("05/11/2026", ref) == "2026-11-05"


def test_validate_totals_detects_mismatch():
    ext_ok = ExtractionResult(
        amount_vnd=900000,
        items=[Item(name="Cà phê hạt 1kg", quantity=5, unit_price_vnd=180000, line_total_vnd=900000)],
    )
    assert validate_totals(ext_ok) == []

    ext_bad = ExtractionResult(
        amount_vnd=950000,
        items=[Item(name="Cà phê hạt 1kg", quantity=5, unit_price_vnd=180000, line_total_vnd=900000)],
    )
    warnings = validate_totals(ext_bad)
    assert len(warnings) == 1
    assert warnings[0].code == "TOTAL_MISMATCH"


@pytest.mark.asyncio
async def test_cross_duplicate_and_price_anomaly():
    repo = MemoryRepo()
    # Test cross-modal duplicate: transfer screenshot matching existing 900,000 VND paper receipt on 2026-11-12
    ext_transfer = ExtractionResult(
        date="2026-11-12",
        type="expense",
        amount_vnd=900000,
        counterparty="Nhà phân phối Cà phê & Nguyên liệu Minh Phát",
        payment_method="transfer",
    )
    dup_warnings, dup_id = await check_duplicate(
        ext=ext_transfer,
        repo=repo,
        household_id="demo",
        doc_kind="transfer",
    )
    assert len(dup_warnings) == 1
    assert dup_warnings[0].code == "CROSS_DUPLICATE"
    assert dup_id == "txn_seed_01"

    # Test price anomaly (>30% above 180,000 VND median)
    ext_anomaly = ExtractionResult(
        date="2026-11-12",
        type="expense",
        amount_vnd=1250000,
        counterparty="Nhà phân phối Minh Phát",
        items=[Item(name="Cà phê hạt 1kg", quantity=5, unit_price_vnd=250000, line_total_vnd=1250000)],
        confidence=ConfidenceScores(),
    )
    price_warnings = await compare_price_history(ext_anomaly, repo=repo, household_id="demo")
    assert len(price_warnings) == 1
    assert price_warnings[0].code == "PRICE_ANOMALY"


@pytest.mark.asyncio
async def test_tax_code_and_category():
    repo = MemoryRepo()
    ext_suspended = ExtractionResult(tax_code="0401999000")
    w = await lookup_tax_code_warning(ext_suspended, repo)
    assert len(w) == 1
    assert w[0].code == "TAX_CODE_NOT_FOUND"

    ext_rev = ExtractionResult(type="revenue", transcript="Sáng ni bán 20 tô mì Quảng")
    cat, tax_grp = classify_category_and_tax(ext_rev)
    assert cat == "an_uong"
    assert tax_grp == "san_xuat_van_tai_an_uong"
    assert normalize_text("Đà Nẵng") == "da nang"
