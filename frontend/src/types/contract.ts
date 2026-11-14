export type TransactionType = 'revenue' | 'expense';

export type CategoryType =
  | 'ban_hang'
  | 'dich_vu'
  | 'an_uong'
  | 'thu_khac'
  | 'nhap_hang'
  | 'chi_phi_van_hanh'
  | 'luong'
  | 'thue_phi'
  | 'chi_khac';

export type TaxGroupType =
  | 'phan_phoi_hang_hoa'
  | 'san_xuat_van_tai_an_uong'
  | 'dich_vu_xay_dung'
  | 'kinh_doanh_khac'
  | 'khong_tinh_thue';

export type PaymentMethodType = 'cash' | 'transfer' | 'unknown';
export type TransactionStatus = 'recorded' | 'needs_review' | 'rejected';
export type TransactionSource = 'agent' | 'manual';
export type DocumentKind = 'image' | 'audio' | 'transfer';

export type WarningCode =
  | 'DUPLICATE'
  | 'CROSS_DUPLICATE'
  | 'PRICE_ANOMALY'
  | 'TOTAL_MISMATCH'
  | 'MISSING_FIELD'
  | 'LOW_CONFIDENCE'
  | 'TAX_CODE_NOT_FOUND'
  | 'IMAGE_QUALITY';

export interface Item {
  name: string;
  quantity: number;
  unit_price_vnd: number;
  line_total_vnd: number;
}

export interface Warning {
  code: WarningCode;
  severity: 'high' | 'medium' | 'info';
  message: string;
}

export interface AuditLogEntry {
  timestamp: string;
  action: 'created' | 'edited' | 'confirmed' | 'merged' | 'rejected';
  actor: string;
  summary: string;
}

export interface Transaction {
  id: string;
  household_id: string;
  document_id: string | null;
  linked_document_ids: string[];
  duplicate_of_id: string | null;
  date: string;
  type: TransactionType;
  category: CategoryType | null;
  tax_group: TaxGroupType;
  payment_method: PaymentMethodType;
  amount_vnd: number;
  counterparty: string | null;
  tax_code: string | null;
  items: Item[];
  transcript: string | null;
  confidence: Record<string, number>;
  status: TransactionStatus;
  clarification_question: string | null;
  warnings: Warning[];
  audit_log?: AuditLogEntry[];
  source: TransactionSource;
  created_at: string;
  updated_at: string;
}

export interface JobEventRecord {
  job_id: string;
  seq: number;
  step: string;
  status: 'running' | 'ok' | 'warn' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  document_id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  events: JobEventRecord[];
  transaction_id: string | null;
  error: string | null;
}

export interface TaxBreakdownItem {
  tax_group: TaxGroupType;
  label: string;
  revenue_vnd: number;
  rate_pct: number;
  tax_vnd: number;
}

export interface TopItemSummary {
  name: string;
  total_vnd: number;
}

export interface PriceIncreaseAlert {
  item: string;
  counterparty: string;
  old_vnd: number;
  new_vnd: number;
  pct: number;
}

export interface LoanReadinessSummary {
  verified_ratio_pct: number;
  with_evidence_count: number;
  total_recorded_count: number;
  cross_verified_count: number;
}

export interface TaxThresholdSummary {
  annualized_revenue_vnd: number;
  recorded_revenue_vnd: number;
  exempt_threshold_vnd: number;
  einvoice_threshold_vnd: number;
  income_tax_method_threshold_vnd: number;
  regime_code: 'under_500m' | '500m_to_1b' | '1b_to_3b' | 'over_3b';
  recommended_books: string[];
  status_label: string;
  filing_deadline_note: string;
  disclaimer: string;
}

export interface PeriodLockState {
  month: string;
  locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
}

export interface EvalBenchmarkSummary {
  scenarios_count: number;
  amount_accuracy_pct: number;
  date_accuracy_pct: number;
  auto_record_precision_pct: number;
  cross_duplicate_recall_pct: number;
  decision_accuracy_pct: number;
  avg_latency_ms: number;
}

export interface HouseholdProfilePayload {
  name: string;
  owner: string;
  tax_code?: string;
  address?: string;
  phone?: string;
  business_sector?: string;
  revenue_tier?: 'under_500m' | '500m_to_3b' | 'over_3b';
  tax_method?: 'percentage_revenue' | 'net_income';
}

export interface AgentChatToolCall {
  tool_name: string;
  args: Record<string, unknown>;
  result_summary: string;
}

export interface AgentChatResponse {
  reply: string;
  tool_calls: AgentChatToolCall[];
  suggested_followups: string[];
  data_updated: boolean;
}

export interface ReportResponse {
  period: { from: string; to: string };
  totals: {
    revenue_vnd: number;
    expense_vnd: number;
    profit_vnd: number;
    estimated_tax_vnd: number;
  };
  tax_breakdown: TaxBreakdownItem[];
  top_items: TopItemSummary[];
  price_increases: PriceIncreaseAlert[];
  loan_readiness: LoanReadinessSummary;
  pending_review: number;
  summary_text: string | null;
  tax_threshold?: TaxThresholdSummary | null;
  period_lock?: PeriodLockState | null;
  eval_benchmark?: EvalBenchmarkSummary | null;
}

export interface SettingsStatus {
  authenticated?: boolean;
  demo_mode?: boolean;
  gemini_configured: boolean;
  gemini_model: string;
  google_client_id?: string;
  gcp_project: string | null;
  lan_urls?: string[];
  household: {
    id?: string;
    name?: string;
    owner?: string;
    phone?: string;
    address?: string;
    tax_code?: string;
    email?: string;
    picture?: string;
    auth_method?: string;
    business_sector?: string;
    revenue_tier?: string;
    tax_method?: string;
  };
}
