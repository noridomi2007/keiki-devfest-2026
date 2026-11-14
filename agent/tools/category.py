from __future__ import annotations

from agent.normalize import normalize_text
from agent.schemas import CategoryType, ExtractionResult, TaxGroupType


def classify_category_and_tax(ext: ExtractionResult) -> tuple[CategoryType | None, TaxGroupType]:
    """Assign category and Circular 152/2025/TT-BTC tax_group based on transaction type & items."""
    tx_type = ext.type or "expense"
    combined_text = normalize_text(
        " ".join(
            [
                ext.counterparty or "",
                ext.transcript or "",
                " ".join(i.name for i in ext.items),
            ]
        )
    )

    if tx_type == "expense":
        cat: CategoryType = ext.category or "nhap_hang"
        if ext.category not in ("nhap_hang", "chi_phi_van_hanh", "luong", "thue_phi", "chi_khac"):
            if any(k in combined_text for k in ["dien", "nuoc", "internet", "mat bang", "gas", "rac"]):
                cat = "chi_phi_van_hanh"
            elif any(k in combined_text for k in ["luong", "phu cap", "nhan vien", "cong nhat"]):
                cat = "luong"
            elif any(k in combined_text for k in ["thue", "le phi", "mon bai"]):
                cat = "thue_phi"
            else:
                cat = "nhap_hang"
        return cat, "khong_tinh_thue"

    # Revenue classification under Circular 152/2025/TT-BTC
    cat_rev: CategoryType = ext.category if ext.category in ("ban_hang", "dich_vu", "an_uong", "thu_khac") else "ban_hang"
    if any(k in combined_text for k in ["mi quang", "bun bo", "ca phe", "to", "ly", "quan an", "com", "banh trang", "an uong"]):
        cat_rev = "an_uong"
        return cat_rev, "san_xuat_van_tai_an_uong"  # 4.5% (3% VAT + 1.5% PIT)

    if any(k in combined_text for k in ["dich vu", "luu tru", "homestay", "giat ui", "cho thue", "du lich"]):
        cat_rev = "dich_vu"
        return cat_rev, "dich_vu_xay_dung"  # 7% (5% VAT + 2% PIT)

    tax_grp: TaxGroupType = ext.tax_group if ext.tax_group and ext.tax_group != "khong_tinh_thue" else "phan_phoi_hang_hoa"
    if cat_rev == "an_uong":
        tax_grp = "san_xuat_van_tai_an_uong"
    elif cat_rev == "dich_vu":
        tax_grp = "dich_vu_xay_dung"
    elif cat_rev == "ban_hang":
        tax_grp = "phan_phoi_hang_hoa"  # 1.5% (1% VAT + 0.5% PIT)
    else:
        tax_grp = "kinh_doanh_khac"  # 3%

    return cat_rev, tax_grp
