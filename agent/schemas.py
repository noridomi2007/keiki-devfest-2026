from __future__ import annotations

from typing import Any, Literal, Protocol, runtime_checkable
from pydantic import BaseModel, Field


TransactionType = Literal["revenue", "expense"]

CategoryType = Literal[
    "ban_hang",
    "dich_vu",
    "an_uong",
    "thu_khac",
    "nhap_hang",
    "chi_phi_van_hanh",
    "luong",
    "thue_phi",
    "chi_khac",
]

TaxGroupType = Literal[
    "phan_phoi_hang_hoa",
    "san_xuat_van_tai_an_uong",
    "dich_vu_xay_dung",
    "kinh_doanh_khac",
    "khong_tinh_thue",
]

PaymentMethodType = Literal["cash", "transfer", "unknown"]
TransactionStatus = Literal["recorded", "needs_review", "rejected"]
TransactionSource = Literal["agent", "manual"]
DocumentKind = Literal["image", "audio", "transfer"]

WarningCode = Literal[
    "DUPLICATE",
    "CROSS_DUPLICATE",
    "PRICE_ANOMALY",
    "TOTAL_MISMATCH",
    "MISSING_FIELD",
    "LOW_CONFIDENCE",
    "TAX_CODE_NOT_FOUND",
    "IMAGE_QUALITY",
]

WarningSeverity = Literal["high", "medium", "info"]


class Item(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price_vnd: int = Field(ge=0)
    line_total_vnd: int = Field(ge=0)


class Warning(BaseModel):
    code: WarningCode
    severity: WarningSeverity
    message: str


class ConfidenceScores(BaseModel):
    date: float = Field(default=0.95, ge=0.0, le=1.0)
    amount_vnd: float = Field(default=0.95, ge=0.0, le=1.0)
    counterparty: float = Field(default=0.90, ge=0.0, le=1.0)
    type: float = Field(default=0.95, ge=0.0, le=1.0)


class ExtractionResult(BaseModel):
    date: str | None = None
    type: TransactionType | None = None
    category: CategoryType | None = None
    tax_group: TaxGroupType | None = None
    payment_method: PaymentMethodType = "unknown"
    amount_vnd: int | None = None
    counterparty: str | None = None
    tax_code: str | None = None
    items: list[Item] = Field(default_factory=list)
    transcript: str | None = None
    confidence: ConfidenceScores = Field(default_factory=ConfidenceScores)
    clarification_question: str | None = None


class AuditLogEntry(BaseModel):
    timestamp: str
    action: Literal["created", "edited", "confirmed", "merged", "rejected"]
    actor: str = "Chủ hộ"
    summary: str


class Transaction(BaseModel):
    id: str
    household_id: str = "demo"
    document_id: str | None = None
    linked_document_ids: list[str] = Field(default_factory=list)
    duplicate_of_id: str | None = None
    date: str
    type: TransactionType
    category: CategoryType | None = None
    tax_group: TaxGroupType = "khong_tinh_thue"
    payment_method: PaymentMethodType = "unknown"
    amount_vnd: int = Field(gt=0)
    counterparty: str | None = None
    tax_code: str | None = None
    items: list[Item] = Field(default_factory=list)
    transcript: str | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    status: TransactionStatus = "needs_review"
    clarification_question: str | None = None
    warnings: list[Warning] = Field(default_factory=list)
    audit_log: list[AuditLogEntry] = Field(default_factory=list)
    source: TransactionSource = "agent"
    created_at: str
    updated_at: str


class PricePoint(BaseModel):
    item_norm: str
    counterparty_norm: str | None = None
    unit_price_vnd: int
    date: str


class TaxCodeInfo(BaseModel):
    tax_code: str
    name: str
    address: str = ""
    status: Literal["dang_hoat_dong", "ngung_hoat_dong"] = "dang_hoat_dong"


class DocumentRef(BaseModel):
    document_id: str
    kind: DocumentKind
    mime_type: str
    data: bytes
    sha256: str
    filename: str | None = None
    preset_hint: str | None = None


class AgentEvent(BaseModel):
    seq: int
    step: Literal[
        "receive",
        "quality_check",
        "extract",
        "normalize",
        "validate",
        "decide",
        "save",
        "done",
        "error",
    ]
    status: Literal["running", "ok", "warn", "error"]
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class AgentSettings(BaseModel):
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    confidence_threshold: float = 0.85
    price_anomaly_threshold: float = 0.30
    total_tolerance_pct: float = 0.01
    total_tolerance_min_vnd: int = 1000
    cache_dir: str | None = None


@runtime_checkable
class Repository(Protocol):
    async def find_duplicates(
        self,
        household_id: str,
        counterparty_norm: str | None,
        date: str,
        amount_vnd: int,
        sha256: str | None,
        doc_kind: str | None = None,
    ) -> list[Transaction]: ...

    async def price_history(
        self,
        household_id: str,
        item_norm: str,
        counterparty_norm: str | None,
        limit: int = 10,
    ) -> list[PricePoint]: ...

    async def lookup_tax_code(self, tax_code: str) -> TaxCodeInfo | None: ...


class AgentContext(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    household_id: str = "demo"
    repo: Any
    settings: AgentSettings = Field(default_factory=AgentSettings)
