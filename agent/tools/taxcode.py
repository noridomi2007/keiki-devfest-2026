from __future__ import annotations

from agent.schemas import ExtractionResult, Repository, Warning


async def lookup_tax_code_warning(
    ext: ExtractionResult,
    repo: Repository,
) -> list[Warning]:
    """Verify supplier tax code against tax registry."""
    if not ext.tax_code:
        return []

    info = await repo.lookup_tax_code(ext.tax_code)
    if info is None:
        return [
            Warning(
                code="TAX_CODE_NOT_FOUND",
                severity="medium",
                message=f"Mã số thuế '{ext.tax_code}' không tìm thấy trong danh bạ thuế Đà Nẵng / Tổng cục Thuế.",
            )
        ]

    if info.status != "dang_hoat_dong":
        return [
            Warning(
                code="TAX_CODE_NOT_FOUND",
                severity="medium",
                message=f"Mã số thuế '{ext.tax_code}' ({info.name}) đang ở trạng thái ngừng hoạt động.",
            )
        ]
    return []
