from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field
from agent.schemas import (
    AuditLogEntry,
    CategoryType,
    DocumentKind,
    Item,
    PaymentMethodType,
    TaxGroupType,
    Transaction,
    TransactionStatus,
    TransactionType,
)


class DocumentRecord(BaseModel):
    id: str
    household_id: str = "demo"
    kind: DocumentKind
    mime_type: str
    sha256: str
    storage_path: str
    uploaded_at: str
    preset_hint: str | None = None


class JobEventRecord(BaseModel):
    job_id: str
    seq: int
    step: str
    status: Literal["running", "ok", "warn", "error"]
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class JobRecord(BaseModel):
    id: str
    household_id: str = "demo"
    document_id: str
    status: Literal["queued", "running", "done", "error"] = "queued"
    events: list[JobEventRecord] = Field(default_factory=list)
    transaction_id: str | None = None
    error: str | None = None


class TransactionCreateRequest(BaseModel):
    date: str
    type: TransactionType
    category: CategoryType | None = None
    tax_group: TaxGroupType | None = None
    payment_method: PaymentMethodType = "cash"
    amount_vnd: int = Field(gt=0)
    counterparty: str | None = None
    tax_code: str | None = None
    items: list[Item] = Field(default_factory=list)


class TransactionPatchRequest(BaseModel):
    date: str | None = None
    type: TransactionType | None = None
    category: CategoryType | None = None
    tax_group: TaxGroupType | None = None
    payment_method: PaymentMethodType | None = None
    amount_vnd: int | None = Field(default=None, gt=0)
    counterparty: str | None = None
    tax_code: str | None = None
    items: list[Item] | None = None
    status: TransactionStatus | None = None


class ConfirmRequest(BaseModel):
    merge_into_duplicate: bool = False


class RejectRequest(BaseModel):
    reason: str | None = None


class TransactionListResponse(BaseModel):
    items: list[Transaction]
    total: int


class TaxBreakdownItem(BaseModel):
    tax_group: TaxGroupType
    label: str
    revenue_vnd: int
    rate_pct: float
    tax_vnd: int


class TopItemSummary(BaseModel):
    name: str
    total_vnd: int


class PriceIncreaseAlert(BaseModel):
    item: str
    counterparty: str
    old_vnd: int
    new_vnd: int
    pct: float


class LoanReadinessSummary(BaseModel):
    verified_ratio_pct: float
    with_evidence_count: int
    total_recorded_count: int
    cross_verified_count: int


class TaxThresholdSummary(BaseModel):
    annualized_revenue_vnd: int
    recorded_revenue_vnd: int
    exempt_threshold_vnd: int = 500_000_000
    einvoice_threshold_vnd: int = 1_000_000_000
    income_tax_method_threshold_vnd: int = 3_000_000_000
    regime_code: Literal["under_500m", "500m_to_1b", "1b_to_3b", "over_3b"]
    recommended_books: list[str]
    status_label: str
    filing_deadline_note: str
    disclaimer: str


class PeriodLockState(BaseModel):
    month: str
    locked: bool
    locked_at: str | None = None
    locked_by: str | None = None


class ReportResponse(BaseModel):
    period: dict[str, str]
    totals: dict[str, int]
    tax_breakdown: list[TaxBreakdownItem]
    top_items: list[TopItemSummary]
    price_increases: list[PriceIncreaseAlert]
    loan_readiness: LoanReadinessSummary
    pending_review: int
    summary_text: str | None = None
    tax_threshold: TaxThresholdSummary | None = None
    period_lock: PeriodLockState | None = None
    eval_benchmark: dict[str, Any] | None = None


class HouseholdProfileUpdateRequest(BaseModel):
    name: str
    owner: str
    tax_code: str = ""
    address: str = ""
    phone: str = ""
    business_sector: str = "Thương mại & Dịch vụ tổng hợp"
    revenue_tier: Literal["under_500m", "500m_to_3b", "over_3b"] = "500m_to_3b"
    tax_method: Literal["percentage_revenue", "net_income"] = "percentage_revenue"


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PeriodLockRequest(BaseModel):
    month: str = "2026-11"
    reason: str = ""


class AgentChatToolCall(BaseModel):
    tool_name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result_summary: str


class AgentChatRequest(BaseModel):
    message: str
    month: str = "2026-11"


class AgentChatResponse(BaseModel):
    reply: str
    tool_calls: list[AgentChatToolCall] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)
    data_updated: bool = False


class ApiKeyUpdateRequest(BaseModel):
    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"
