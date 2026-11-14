from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from backend.app.repositories.memory import MemoryRepo
from backend.app.security import sanitize_spreadsheet_cell
from backend.app.services.storage import storage_service


def _style_header(ws, row_idx: int, col_count: int) -> None:
    fill = PatternFill(start_color="3B2FA8", end_color="3B2FA8", fill_type="solid")
    font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    thin = Side(border_style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for col in range(1, col_count + 1):
        cell = ws.cell(row=row_idx, column=col)
        cell.fill = fill
        cell.font = font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border


def _auto_width(ws, col_count: int) -> None:
    for col in range(1, col_count + 1):
        col_letter = get_column_letter(col)
        max_len = max(
            (len(str(ws.cell(row=r, column=col).value or "")) for r in range(1, ws.max_row + 1)),
            default=12,
        )
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 42)


def _write_tt152_header(
    ws,
    hh: dict,
    form_code: str,
    form_title: str,
    month: str,
) -> None:
    """Write standardized Circular 152/2025/TT-BTC header block (Rows 1-3) for every ledger sheet."""
    bold_font = Font(name="Arial", size=11, bold=True, color="1B1F2A")
    sub_font = Font(name="Arial", size=10, italic=True, color="475569")
    title_font = Font(name="Arial", size=14, bold=True, color="1B1F2A")
    ws["A1"] = sanitize_spreadsheet_cell(
        f"HỘ, CÁ NHÂN KINH DOANH: {str(hh.get('name', '')).upper()} — MST: {hh.get('tax_code', '')}"
    )
    ws["A2"] = sanitize_spreadsheet_cell(
        f"Địa chỉ: {hh.get('address', '')} | Mẫu số {form_code} "
        "(Ban hành kèm theo Thông tư số 152/2025/TT-BTC ngày 31/12/2025 của Bộ Tài chính)"
    )
    ws["A3"] = f"{form_title} ({form_code}) — Kỳ kế toán: {month}"
    ws["A1"].font = bold_font
    ws["A2"].font = sub_font
    ws["A3"].font = title_font


def generate_tt152_excel(repo: MemoryRepo, month: str = "2026-11", household_id: str = "") -> bytes:
    """Generate full Circular 152/2025/TT-BTC Excel workbook (S2a/S1a, S2c, S2d, S2e, HoSoVayVon)."""
    date_from = f"{month}-01"
    date_to = f"{month}-31"
    txs = [
        t
        for t in repo.list_transactions(household_id=household_id, date_from=date_from, date_to=date_to)
        if t.status == "recorded"
    ]
    txs.sort(key=lambda x: x.date)

    hh = repo.get_household(household_id) or {
        "name": "Cửa hàng Thương mại & Dịch vụ Minh Tâm",
        "address": "142 Nguyễn Thị Minh Khai, Quận 3, TP. Hồ Chí Minh",
        "tax_code": "0316889912",
    }

    wb = Workbook()
    thin = Side(border_style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    title_font = Font(name="Arial", size=14, bold=True, color="1B1F2A")
    sub_font = Font(name="Arial", size=10, italic=True, color="475569")
    bold_font = Font(name="Arial", size=11, bold=True)

    # =========================================================================
    # SHEET 1: S2a-HKD / S1a-HKD — SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ
    # =========================================================================
    ws1 = wb.active
    ws1.title = "S2a-HKD_DoanhThu"
    _write_tt152_header(ws1, hh, "S2a-HKD / S1a-HKD", "SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ", month)

    headers_s1 = [
        "Ngày ghi sổ",
        "Số hiệu CT",
        "Diễn giải (Đối tác / Nội dung)",
        "Phân phối hàng hóa (1,5%)",
        "Sản xuất, ăn uống (4,5%)",
        "Dịch vụ, lưu trú (7%)",
        "Kinh doanh khác (3%)",
        "PT Thanh toán",
        "Chứng từ gốc đối chiếu",
    ]
    for idx, h in enumerate(headers_s1, start=1):
        ws1.cell(row=5, column=idx, value=h)
    _style_header(ws1, 5, len(headers_s1))

    row_s1 = 6
    tot_g1 = tot_g2 = tot_g3 = tot_g4 = 0
    for t in txs:
        if t.type != "revenue":
            continue
        g1 = t.amount_vnd if t.tax_group == "phan_phoi_hang_hoa" else 0
        g2 = t.amount_vnd if t.tax_group == "san_xuat_van_tai_an_uong" else 0
        g3 = t.amount_vnd if t.tax_group == "dich_vu_xay_dung" else 0
        g4 = t.amount_vnd if t.tax_group == "kinh_doanh_khac" else 0
        tot_g1 += g1
        tot_g2 += g2
        tot_g3 += g3
        tot_g4 += g4

        evidence_str = ", ".join(t.linked_document_ids) if t.linked_document_ids else ("Ghi âm giọng nói" if t.transcript else "Nhập tay")
        vals = [
            sanitize_spreadsheet_cell(t.date),
            sanitize_spreadsheet_cell(t.id),
            sanitize_spreadsheet_cell(t.counterparty or "Doanh thu bán hàng"),
            g1,
            g2,
            g3,
            g4,
            "Chuyển khoản" if t.payment_method == "transfer" else "Tiền mặt",
            sanitize_spreadsheet_cell(evidence_str),
        ]
        for c_idx, val in enumerate(vals, start=1):
            c = ws1.cell(row=row_s1, column=c_idx, value=val)
            c.border = border
            if 4 <= c_idx <= 7:
                c.number_format = "#,##0"
        row_s1 += 1

    ws1.cell(row=row_s1, column=3, value="TỔNG CỘNG DOANH THU TRONG KỲ").font = bold_font
    for col_i, tot_v in [(4, tot_g1), (5, tot_g2), (6, tot_g3), (7, tot_g4)]:
        c = ws1.cell(row=row_s1, column=col_i, value=tot_v)
        c.font = bold_font
        c.number_format = "#,##0"
        c.border = border

    note_row = row_s1 + 2
    ws1.cell(
        row=note_row,
        column=1,
        value=(
            "Ghi chú pháp lý: Số thuế GTGT & TNCN tính theo tỷ lệ % (1,5% / 3% / 4,5% / 7%) "
            "là số ước tính tạm tính để tham khảo dòng tiền, không thay thế Tờ khai thuế chính thức (Mẫu 01/CNKD). "
            "Ngưỡng miễn thuế từ 2026: Doanh thu năm ≤ 500 triệu đồng (dùng Mẫu S1a-HKD)."
        ),
    ).font = sub_font
    _auto_width(ws1, len(headers_s1))

    # =========================================================================
    # SHEET 2: S2c-HKD — SỔ CHI TIẾT DOANH THU, CHI PHÍ
    # =========================================================================
    ws2 = wb.create_sheet(title="S2c-HKD_DoanhThuChiPhi")
    _write_tt152_header(ws2, hh, "S2c-HKD", "SỔ CHI TIẾT DOANH THU, CHI PHÍ", month)
    headers_s2c = [
        "Ngày ghi sổ",
        "Số hiệu CT",
        "Diễn giải (Đối tác / Nội dung)",
        "Mã số thuế",
        "Doanh thu (VND)",
        "Tổng chi phí hợp lệ (VND)",
        "Chi vật liệu / hàng hóa",
        "Chi điện, nước, vận hành",
        "Chi nhân công & khác",
        "Chứng từ đối chiếu",
    ]
    for idx, h in enumerate(headers_s2c, start=1):
        ws2.cell(row=5, column=idx, value=h)
    _style_header(ws2, 5, len(headers_s2c))

    row_s2c = 6
    tot_rev_s2c = 0
    tot_exp = 0
    for t in txs:
        rev_val = t.amount_vnd if t.type == "revenue" else 0
        exp_val = t.amount_vnd if t.type == "expense" else 0
        tot_rev_s2c += rev_val
        tot_exp += exp_val
        c_nhap = exp_val if t.category == "nhap_hang" else 0
        c_vh = exp_val if t.category == "chi_phi_van_hanh" else 0
        c_khac = exp_val if t.type == "expense" and t.category not in ("nhap_hang", "chi_phi_van_hanh") else 0
        ev_str = " + ".join(t.linked_document_ids) if t.linked_document_ids else ("Ghi âm giọng nói" if t.transcript else "Nhập tay")
        if len(t.linked_document_ids) >= 2:
            ev_str += " (Đủ Hóa đơn + CK)"

        vals = [
            sanitize_spreadsheet_cell(t.date),
            sanitize_spreadsheet_cell(t.id),
            sanitize_spreadsheet_cell(t.counterparty or ("Doanh thu bán hàng" if t.type == "revenue" else "Chi phí")),
            sanitize_spreadsheet_cell(t.tax_code or ""),
            rev_val,
            exp_val,
            c_nhap,
            c_vh,
            c_khac,
            sanitize_spreadsheet_cell(ev_str),
        ]
        for c_idx, val in enumerate(vals, start=1):
            c = ws2.cell(row=row_s2c, column=c_idx, value=val)
            c.border = border
            if 5 <= c_idx <= 9:
                c.number_format = "#,##0"
        row_s2c += 1

    ws2.cell(row=row_s2c, column=3, value="TỔNG DOANH THU & CHI PHÍ TRONG KỲ").font = bold_font
    c_rev_tot = ws2.cell(row=row_s2c, column=5, value=tot_rev_s2c)
    c_rev_tot.font = bold_font
    c_rev_tot.number_format = "#,##0"
    c_rev_tot.border = border
    c_exp_tot = ws2.cell(row=row_s2c, column=6, value=tot_exp)
    c_exp_tot.font = bold_font
    c_exp_tot.number_format = "#,##0"
    c_exp_tot.border = border

    ws2.cell(row=row_s2c + 1, column=3, value="Chênh lệch Doanh thu − Chi phí (Thu nhập tạm tính)").font = bold_font
    c_net = ws2.cell(row=row_s2c + 1, column=5, value=tot_rev_s2c - tot_exp)
    c_net.font = bold_font
    c_net.number_format = "#,##0"
    c_net.border = border
    _auto_width(ws2, len(headers_s2c))

    # =========================================================================
    # SHEET 3: S2d-HKD — SỔ CHI TIẾT VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA
    # =========================================================================
    ws3 = wb.create_sheet(title="S2d-HKD_VatLieuHangHoa")
    _write_tt152_header(ws3, hh, "S2d-HKD", "SỔ CHI TIẾT VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA", month)
    headers_s2d = [
        "Ngày chứng từ",
        "Số hiệu CT",
        "Diễn giải / Nhà cung cấp",
        "Tên vật liệu, dụng cụ, sản phẩm, hàng hóa",
        "Đơn vị tính",
        "Đơn giá (VND)",
        "SL Nhập",
        "Thành tiền Nhập (VND)",
        "SL Xuất",
        "Thành tiền Xuất (VND)",
    ]
    for idx, h in enumerate(headers_s2d, start=1):
        ws3.cell(row=5, column=idx, value=h)
    _style_header(ws3, 5, len(headers_s2d))

    row_s2d = 6
    for t in txs:
        if not t.items:
            continue
        is_in = t.type == "expense"
        for item in t.items:
            vals = [
                sanitize_spreadsheet_cell(t.date),
                sanitize_spreadsheet_cell(t.id),
                sanitize_spreadsheet_cell(t.counterparty or ""),
                sanitize_spreadsheet_cell(item.name),
                "Đơn vị",
                item.unit_price_vnd,
                item.quantity if is_in else 0,
                item.line_total_vnd if is_in else 0,
                item.quantity if not is_in else 0,
                item.line_total_vnd if not is_in else 0,
            ]
            for c_idx, val in enumerate(vals, start=1):
                c = ws3.cell(row=row_s2d, column=c_idx, value=val)
                c.border = border
                if c_idx in (6, 8, 10):
                    c.number_format = "#,##0"
            row_s2d += 1
    _auto_width(ws3, len(headers_s2d))

    # =========================================================================
    # SHEET 4: S2e-HKD — SỔ CHI TIẾT TIỀN MẶT & TIỀN GỬI NGÂN HÀNG
    # =========================================================================
    ws4 = wb.create_sheet(title="S2e-HKD_ChiTietTien")
    _write_tt152_header(ws4, hh, "S2e-HKD", "SỔ CHI TIẾT TIỀN MẶT & TIỀN GỬI NGÂN HÀNG", month)
    headers_s2e = [
        "Ngày ghi sổ",
        "Số hiệu CT",
        "Diễn giải",
        "Loại quỹ (Tiền mặt / Ngân hàng)",
        "Số tiền Thu (VND)",
        "Số tiền Chi (VND)",
        "Tồn lũy kế trong kỳ (VND)",
        "Chứng từ gốc",
    ]
    for idx, h in enumerate(headers_s2e, start=1):
        ws4.cell(row=5, column=idx, value=h)
    _style_header(ws4, 5, len(headers_s2e))

    row_s2e = 6
    running_balance = 0
    for t in txs:
        in_amt = t.amount_vnd if t.type == "revenue" else 0
        out_amt = t.amount_vnd if t.type == "expense" else 0
        running_balance += in_amt - out_amt
        ev_str = ", ".join(t.linked_document_ids) if t.linked_document_ids else ("Ghi âm giọng nói" if t.transcript else "Nhập tay")
        fund_label = "Tiền gửi Ngân hàng (VietQR)" if t.payment_method == "transfer" else "Tiền mặt tại quỹ"
        vals = [
            sanitize_spreadsheet_cell(t.date),
            sanitize_spreadsheet_cell(t.id),
            sanitize_spreadsheet_cell(t.counterparty or ("Thu bán hàng" if t.type == "revenue" else "Chi hoạt động")),
            fund_label,
            in_amt,
            out_amt,
            running_balance,
            sanitize_spreadsheet_cell(ev_str),
        ]
        for c_idx, val in enumerate(vals, start=1):
            c = ws4.cell(row=row_s2e, column=c_idx, value=val)
            c.border = border
            if c_idx in (5, 6, 7):
                c.number_format = "#,##0"
        row_s2e += 1
    _auto_width(ws4, len(headers_s2e))

    # =========================================================================
    # SHEET 5: HoSoVayVon — TÓM TẮT HỒ SƠ DÒNG TIỀN MINH BẠCH VAY VỐN NGÂN HÀNG
    # =========================================================================
    ws5 = wb.create_sheet(title="HoSoVayVon_NganHang")
    ws5["A1"] = "HỒ SƠ TÓM TẮT DÒNG TIỀN & ĐỘ MINH BẠCH CHỨNG TỪ (PHỤC VỤ TIẾP CẬN VỐN VAY NGÂN HÀNG)"
    ws5["A1"].font = title_font
    ws5["A2"] = sanitize_spreadsheet_cell(
        f"Đơn vị: {hh.get('name', '')} | Địa chỉ: {hh.get('address', '')} | MST: {hh.get('tax_code', '')}"
    )
    ws5["A2"].font = sub_font

    total_rev = tot_g1 + tot_g2 + tot_g3 + tot_g4
    net_profit = total_rev - tot_exp
    with_ev = sum(1 for t in txs if t.document_id or t.linked_document_ids or t.transcript)
    cross_ev = sum(1 for t in txs if len(t.linked_document_ids) >= 2)
    audit_count = sum(1 for t in txs if len(t.audit_log) > 0)
    lock_info = repo.get_period_lock(household_id, month)
    lock_status = f"Đã chốt sổ ({lock_info.get('locked_at', '')[:10]})" if lock_info else "Chưa chốt kỳ"
    ratio_pct = round((with_ev / len(txs)) * 100, 1) if txs else 100.0

    summary_rows = [
        ("Chỉ tiêu đánh giá năng lực tài chính & minh bạch sổ sách", "Giá trị"),
        ("1. Tổng doanh thu ghi sổ hợp lệ trong kỳ (VND)", total_rev),
        ("2. Tổng chi phí sản xuất kinh doanh có đối chiếu (VND)", tot_exp),
        ("3. Lợi nhuận ròng tạm tính trong kỳ (VND)", net_profit),
        ("4. Tổng số bút toán đã ghi sổ", len(txs)),
        ("5. Số bút toán có chứng từ gốc (Ảnh hóa đơn / VietQR / Ghi âm)", with_ev),
        ("6. Số bút toán đối chiếu chéo kép (Có đủ cả Hóa đơn giấy + Ảnh chuyển khoản)", cross_ev),
        ("7. Tỷ lệ minh bạch chứng từ (%)", f"{ratio_pct}%"),
        ("8. Số bút toán có nhật ký kiểm toán (Audit Trail)", audit_count),
        ("9. Trạng thái khóa sổ kỳ kế toán", lock_status),
    ]
    for r_i, (k, v) in enumerate(summary_rows, start=4):
        c1 = ws5.cell(row=r_i, column=1, value=k)
        c2 = ws5.cell(row=r_i, column=2, value=v)
        c1.border = border
        c2.border = border
        if isinstance(v, int) and r_i in (5, 6, 7):
            c2.number_format = "#,##0"
    _style_header(ws5, 4, 2)
    _auto_width(ws5, 2)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def generate_export_zip(repo: MemoryRepo, month: str = "2026-11", household_id: str = "") -> bytes:
    """Create a .zip containing the TT152 Excel workbook, all original evidence images, and an index CSV."""
    xlsx_bytes = generate_tt152_excel(repo=repo, month=month, household_id=household_id)
    date_from = f"{month}-01"
    date_to = f"{month}-31"
    txs = [
        t
        for t in repo.list_transactions(household_id=household_id, date_from=date_from, date_to=date_to)
        if t.status == "recorded"
    ]

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"So_Ke_Toan_TT152_Keiki_{month}.xlsx", xlsx_bytes)

        csv_buf = io.StringIO()
        writer = csv.writer(csv_buf)
        writer.writerow(["transaction_id", "date", "type", "amount_vnd", "counterparty", "evidence_files"])

        for t in txs:
            doc_ids = list(t.linked_document_ids) or ([t.document_id] if t.document_id else [])
            saved_files: list[str] = []
            for did in doc_ids:
                if not did:
                    continue
                doc = repo.get_document(did)
                if doc and doc.household_id == household_id:
                    ext = Path(doc.storage_path).suffix or ".svg"
                    arc_name = f"chung_tu/{t.date}_{t.id}_{did}{ext}"
                    raw_bytes = storage_service.read_bytes(doc.storage_path, doc.preset_hint)
                    zf.writestr(arc_name, raw_bytes)
                    saved_files.append(arc_name)
            writer.writerow([
                sanitize_spreadsheet_cell(t.id),
                sanitize_spreadsheet_cell(t.date),
                sanitize_spreadsheet_cell(t.type),
                t.amount_vnd,
                sanitize_spreadsheet_cell(t.counterparty or ""),
                sanitize_spreadsheet_cell("; ".join(saved_files)),
            ])

        zf.writestr("doi_chieu_chung_tu.csv", csv_buf.getvalue().encode("utf-8-sig"))

    return zip_buf.getvalue()
