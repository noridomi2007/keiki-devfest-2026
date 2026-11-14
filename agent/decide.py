from __future__ import annotations

from typing import Literal
from agent.schemas import ExtractionResult, Warning


def decide_and_question(
    ext: ExtractionResult,
    warnings: list[Warning],
    confidence_threshold: float = 0.85,
) -> tuple[Literal["recorded", "needs_review"], list[Warning], str | None]:
    """Determine whether to auto-record ('recorded') or ask the household owner ('needs_review')."""
    all_warnings = list(warnings)

    # Check missing required fields
    missing: list[str] = []
    if not ext.date:
        missing.append("ngày chứng từ")
    if not ext.amount_vnd or ext.amount_vnd <= 0:
        missing.append("số tiền")
    if not ext.type:
        missing.append("loại thu/chi")

    if missing:
        all_warnings.append(
            Warning(
                code="MISSING_FIELD",
                severity="high",
                message=f"Chứng từ còn thiếu thông tin: {', '.join(missing)}.",
            )
        )

    # Check confidence scores on key fields
    low_fields: list[str] = []
    if ext.confidence.date < confidence_threshold:
        low_fields.append("ngày tháng")
    if ext.confidence.amount_vnd < confidence_threshold:
        low_fields.append("tổng số tiền")
    if ext.confidence.type < confidence_threshold:
        low_fields.append("phân loại thu/chi")
    if ext.confidence.counterparty < confidence_threshold:
        low_fields.append("tên đối tác/cửa hàng")

    if low_fields:
        all_warnings.append(
            Warning(
                code="LOW_CONFIDENCE",
                severity="high",
                message=f"Chữ hơi mờ hoặc thông tin chưa rõ ở trường: {', '.join(low_fields)}.",
            )
        )

    has_blocking_warning = any(w.severity in ("high", "medium") for w in all_warnings)
    question = ext.clarification_question

    if not has_blocking_warning and not question:
        return "recorded", all_warnings, None

    # Build a polite, clear Vietnamese clarification question for the shop owner
    if not question:
        codes = {w.code for w in all_warnings}
        amount_fmt = f"{(ext.amount_vnd or 0):,}".replace(",", ".")
        if "CROSS_DUPLICATE" in codes:
            question = (
                f"Cô/chú ơi, chứng từ {amount_fmt} đ này trùng khớp với giao dịch của "
                f"'{ext.counterparty or 'đối tác cùng ngày'}' đã có trong sổ. "
                f"Cô/chú muốn gộp ảnh chuyển khoản này vào hóa đơn gốc để tránh cộng sổ 2 lần không ạ?"
            )
        elif "DUPLICATE" in codes:
            question = (
                f"Cô/chú ơi, chứng từ {amount_fmt} đ của '{ext.counterparty or 'đối tác này'}' "
                f"có vẻ đã được chụp trước đó rồi. Cô/chú muốn bỏ qua để không bị ghi trùng nhé?"
            )
        elif "PRICE_ANOMALY" in codes:
            price_msg = next(w.message for w in all_warnings if w.code == "PRICE_ANOMALY")
            question = f"Cô/chú ơi, {price_msg} Cô/chú kiểm tra giúp đây là giá mới hay nhà cung cấp ghi nhầm ạ?"
        elif "TOTAL_MISMATCH" in codes:
            tot_msg = next(w.message for w in all_warnings if w.code == "TOTAL_MISMATCH")
            question = f"Cô/chú ơi, {tot_msg} Cô/chú xác nhận giúp số tiền thực tế thanh toán là bao nhiêu ạ?"
        elif "TAX_CODE_NOT_FOUND" in codes:
            tax_msg = next(w.message for w in all_warnings if w.code == "TAX_CODE_NOT_FOUND")
            question = f"Cô/chú ơi, {tax_msg} Cô/chú có vẫn muốn lưu khoản chi này vào sổ không ạ?"
        else:
            question = (
                f"Cô/chú ơi, thông tin ({', '.join(low_fields or missing or ['chứng từ'])}) chưa thật rõ. "
                f"Cô/chú kiểm tra và bấm xác nhận giúp Keiki nhé!"
            )

    return "needs_review", all_warnings, question
