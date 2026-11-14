from __future__ import annotations

import html


def _esc(value: str) -> str:
    """Escape text before embedding inside generated SVG XML documents."""
    return html.escape(value, quote=True)


def generate_document_svg(preset: str) -> bytes:
    """Generate crisp, realistic Vietnamese SVG receipt or VietQR transfer screenshot for viewing & testing."""
    p = (preset or "").lower()

    if "transfer" in p or "vietqr" in p:
        amount = "540.000 VND" if "540" in p else "900.000 VND"
        receiver = "NPP BIA SONG HAN" if "540" in p else "DAI LY CA PHE MINH PHAT"
        desc = "Quan Ba Sau TT 2 thung Larue" if "540" in p else "Quan Ba Sau TT 5kg ca phe hat"
        date_str = "10/11/2026 10:05" if "540" in p else "12/11/2026 08:25"
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="520" height="680" viewBox="0 0 520 680">
  <rect width="520" height="680" rx="24" fill="#0F4C81"/>
  <rect x="20" y="24" width="480" height="632" rx="20" fill="#FFFFFF"/>
  <circle cx="260" cy="86" r="32" fill="#0F7B5F"/>
  <path d="M245 86 L256 97 L278 75" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round"/>
  <text x="260" y="142" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#0F7B5F">CHUYỂN KHOẢN THÀNH CÔNG (VietQR)</text>
  <text x="260" y="182" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#1B1F2A">{_esc(amount)}</text>
  <text x="260" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#64748B">{_esc(date_str)}</text>
  <line x1="48" y1="236" x2="472" y2="236" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="6,6"/>
  <text x="52" y="274" font-family="Arial, sans-serif" font-size="14" fill="#64748B">Tài khoản thụ hưởng</text>
  <text x="468" y="274" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#1B1F2A">{_esc(receiver)}</text>
  <text x="52" y="318" font-family="Arial, sans-serif" font-size="14" fill="#64748B">Ngân hàng nhận</text>
  <text x="468" y="318" text-anchor="end" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#1B1F2A">Vietcombank — CN Đà Nẵng</text>
  <text x="52" y="362" font-family="Arial, sans-serif" font-size="14" fill="#64748B">Số tài khoản</text>
  <text x="468" y="362" text-anchor="end" font-family="Arial, sans-serif" font-size="15" fill="#1B1F2A">0041 0009 88xx (Đã ẩn danh)</text>
  <text x="52" y="406" font-family="Arial, sans-serif" font-size="14" fill="#64748B">Nội dung chuyển tiền</text>
  <text x="468" y="406" text-anchor="end" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#3B2FA8">{_esc(desc)}</text>
  <text x="52" y="450" font-family="Arial, sans-serif" font-size="14" fill="#64748B">Mã giao dịch</text>
  <text x="468" y="450" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#1B1F2A">FT26316889912</text>
  <rect x="48" y="495" width="424" height="110" rx="12" fill="#F8FAFC" stroke="#CBD5E1"/>
  <text x="260" y="535" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#3B2FA8">BIÊN LAI CHUYỂN KHOẢN NGÂN HÀNG</text>
  <text x="260" y="562" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#475569">Đối chiếu tự động bởi Keiki AI — GDG DevFest Miền Trung 2026</text>
</svg>"""
        return svg.encode("utf-8")

    if "anomaly" in p or "1250" in p:
        unit_price = "250.000"
        total_price = "1.250.000 đ"
        note_banner = "ĐƠN GIÁ TĂNG ĐỘT BIẾN (+39% SO VỚI LỊCH SỬ 180.000đ)"
        banner_color = "#C62828"
        date_str = "Ngày 11 tháng 11 năm 2026"
        supplier = "ĐẠI LÝ CÀ PHÊ & NGUYÊN LIỆU MINH PHÁT"
        tax_code = "0401234567"
        item_name = "Cà phê hạt rang mộc 1kg"
        qty = "5"
    elif "bia" in p or "540" in p:
        unit_price = "270.000"
        total_price = "540.000 đ"
        note_banner = "HÓA ĐƠN BÁN HÀNG KIÊM PHIẾU GIAO HÀNG"
        banner_color = "#3B2FA8"
        date_str = "Ngày 10 tháng 11 năm 2026"
        supplier = "NPP BIA & NƯỚC GIẢI KHÁT SÔNG HÀN"
        tax_code = "0401988776"
        item_name = "Bia Larue thùng 24 lon"
        qty = "2"
    elif "chabo" in p or "560" in p:
        unit_price = "280.000"
        total_price = "560.000 đ"
        note_banner = "PHIẾU GIAO HÀNG CHỢ CỒN — ĐÀ NẴNG"
        banner_color = "#3B2FA8"
        date_str = "Ngày 09 tháng 11 năm 2026"
        supplier = "CƠ SỞ CHẢ BÒ BÀ TÂM CHỢ CỒN"
        tax_code = "0401777888"
        item_name = "Chả bò Đà Nẵng loại 1 (kg)"
        qty = "2"
    else:
        unit_price = "180.000"
        total_price = "900.000 đ"
        note_banner = "HÓA ĐƠN BÁN LẺ NGUYÊN LIỆU"
        banner_color = "#3B2FA8"
        date_str = "Ngày 12 tháng 11 năm 2026"
        supplier = "ĐẠI LÝ CÀ PHÊ & NGUYÊN LIỆU MINH PHÁT"
        tax_code = "0401234567"
        item_name = "Cà phê hạt 1kg"
        qty = "5"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="560" height="680" viewBox="0 0 560 680">
  <rect width="560" height="680" fill="#EAE6DF"/>
  <rect x="28" y="24" width="504" height="632" fill="#FFFDF9" stroke="#D5DCE8" stroke-width="2"/>
  <text x="280" y="68" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1B1F2A">{_esc(supplier)}</text>
  <text x="280" y="94" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#475569">ĐC: Quận Hải Châu, TP. Đà Nẵng — MST: {_esc(tax_code)}</text>
  <line x1="56" y1="114" x2="504" y2="114" stroke="#94A3B8" stroke-width="1.5"/>
  <text x="280" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="{_esc(banner_color)}">{_esc(note_banner)}</text>
  <text x="280" y="176" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-style="italic" fill="#475569">{_esc(date_str)}</text>
  <text x="56" y="212" font-family="Arial, sans-serif" font-size="15" fill="#1B1F2A">Khách hàng: <tspan font-weight="bold">Quán Mì Quảng &amp; Tạp hóa Bà Sáu (Hải Châu, ĐN)</tspan></text>
  <rect x="56" y="236" width="448" height="38" fill="#F1F5F9" stroke="#CBD5E1"/>
  <text x="68" y="260" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1B1F2A">Tên mặt hàng</text>
  <text x="290" y="260" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1B1F2A">SL</text>
  <text x="345" y="260" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1B1F2A">Đơn giá</text>
  <text x="492" y="260" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1B1F2A">Thành tiền</text>
  <rect x="56" y="274" width="448" height="54" fill="#FFFFFF" stroke="#CBD5E1"/>
  <text x="68" y="306" font-family="Arial, sans-serif" font-size="15" fill="#1B1F2A">{_esc(item_name)}</text>
  <text x="295" y="306" font-family="Arial, sans-serif" font-size="15" fill="#1B1F2A">{_esc(qty)}</text>
  <text x="345" y="306" font-family="Arial, sans-serif" font-size="15" fill="#1B1F2A">{_esc(unit_price)}</text>
  <text x="492" y="306" text-anchor="end" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#1B1F2A">{_esc(total_price)}</text>
  <rect x="56" y="360" width="448" height="56" fill="#FEF9C3" stroke="#FDE047" stroke-width="1.5"/>
  <text x="72" y="395" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1B1F2A">TỔNG CỘNG THANH TOÁN:</text>
  <text x="490" y="395" text-anchor="end" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#C62828">{_esc(total_price)}</text>
  <text x="140" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#475569">Người mua hàng</text>
  <text x="420" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#475569">Người lập phiếu</text>
  <text x="420" y="545" text-anchor="middle" font-family="Georgia, serif" font-size="18" font-style="italic" fill="#3B2FA8">Minh Phát</text>
</svg>"""
    return svg.encode("utf-8")
