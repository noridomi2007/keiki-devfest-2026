from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from agent.normalize import normalize_text
from agent.schemas import AuditLogEntry, PricePoint, TaxCodeInfo, Transaction
from backend.app.models import DocumentRecord, JobRecord


AGENT_DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "agent" / "data"
SEED_FILE = Path(__file__).resolve().parent.parent / "fixtures" / "seed_danang.json"
STATE_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "keiki_runtime_state.json"


class MemoryRepo:
    """In-memory repository with atomic disk persistence, period locks, and pre-loaded Đà Nẵng seed data."""

    MAX_HOUSEHOLDS = 5000
    MAX_USERS = 5000
    MAX_DOCUMENTS = 5000
    MAX_TRANSACTIONS = 10000
    MAX_JOBS = 2000

    def __init__(self) -> None:
        self.documents: dict[str, DocumentRecord] = {}
        self.transactions: dict[str, Transaction] = {}
        self.jobs: dict[str, JobRecord] = {}
        self.price_points: list[PricePoint] = []
        self.tax_codes: dict[str, TaxCodeInfo] = {}
        self.households: dict[str, dict[str, str]] = {}
        self.users: dict[str, dict[str, str]] = {}
        self.locked_periods: dict[str, dict[str, str]] = {}
        self.household_info: dict[str, str] = {}
        self._persistence_enabled: bool = True
        self._load_seed_only()
        self._load_snapshot()

    def _load_seed_only(self) -> None:
        self.documents.clear()
        self.transactions.clear()
        self.jobs.clear()
        self.price_points.clear()
        self.tax_codes.clear()
        self.households.clear()
        self.users.clear()
        self.locked_periods.clear()

        # Load tax codes & price history from agent/data
        tax_file = AGENT_DATA_DIR / "tax_codes_demo.json"
        if tax_file.exists():
            for row in json.loads(tax_file.read_text(encoding="utf-8")):
                info = TaxCodeInfo.model_validate(row)
                self.tax_codes[info.tax_code] = info

        price_file = AGENT_DATA_DIR / "price_history_demo.json"
        if price_file.exists():
            for row in json.loads(price_file.read_text(encoding="utf-8")):
                self.price_points.append(PricePoint.model_validate(row))

        # Load Đà Nẵng seed data
        if SEED_FILE.exists():
            seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
            hh_seed = dict(seed.get("household", {}))
            hh_seed.setdefault("business_sector", "Thương mại, dịch vụ & ăn uống")
            hh_seed.setdefault("revenue_tier", "500m_to_3b")
            hh_seed.setdefault("tax_method", "percentage_revenue")
            self.household_info = dict(hh_seed)
            self.households["demo"] = dict(hh_seed)
            for doc_raw in seed.get("documents", []):
                doc = DocumentRecord.model_validate(doc_raw)
                self.documents[doc.id] = doc
            for tx_raw in seed.get("transactions", []):
                tx = Transaction.model_validate(tx_raw)
                if not tx.audit_log:
                    tx = tx.model_copy(
                        update={
                            "audit_log": [
                                AuditLogEntry(
                                    timestamp=tx.created_at,
                                    action="created",
                                    actor="Keiki AI Agent" if tx.source == "agent" else "Chủ hộ",
                                    summary="Khởi tạo bút toán từ chứng từ gốc",
                                )
                            ]
                        }
                    )
                self.transactions[tx.id] = tx

    def _load_snapshot(self) -> None:
        if not self._persistence_enabled or not STATE_FILE.exists():
            return
        try:
            payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            for hid, hh in (payload.get("households") or {}).items():
                self.households[str(hid)] = dict(hh)
                if hid == "demo":
                    self.household_info = dict(hh)
            for phone, usr in (payload.get("users") or {}).items():
                self.users[str(phone)] = dict(usr)
            for doc_id, doc_raw in (payload.get("documents") or {}).items():
                self.documents[str(doc_id)] = DocumentRecord.model_validate(doc_raw)
            for tx_id, tx_raw in (payload.get("transactions") or {}).items():
                self.transactions[str(tx_id)] = Transaction.model_validate(tx_raw)
            for lock_key, lock_info in (payload.get("locked_periods") or {}).items():
                self.locked_periods[str(lock_key)] = dict(lock_info)
        except Exception:
            # Keep clean seed state if snapshot cannot be read
            pass

    def _save_snapshot(self) -> None:
        if not self._persistence_enabled:
            return
        try:
            STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "households": self.households,
                "users": self.users,
                "documents": {k: v.model_dump() for k, v in self.documents.items()},
                "transactions": {k: v.model_dump() for k, v in self.transactions.items()},
                "locked_periods": self.locked_periods,
            }
            tmp_path = STATE_FILE.with_suffix(".tmp")
            tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp_path, STATE_FILE)
        except Exception:
            # Read-only container environments should never fail API mutations
            pass

    def reset_to_seed(self) -> None:
        self._load_seed_only()
        try:
            if STATE_FILE.exists():
                STATE_FILE.unlink()
        except Exception:
            pass

    @staticmethod
    def _evict_oldest_if_full(store: dict, max_items: int, protected_keys: set[str] | None = None) -> None:
        if len(store) < max_items:
            return
        for k in list(store.keys()):
            if protected_keys and k in protected_keys:
                continue
            if str(k).endswith("_seed_01") or str(k).endswith("_seed_02") or "_seed_" in str(k):
                continue
            store.pop(k, None)
            if len(store) < max_items:
                break

    def save_household(self, household_id: str, info: dict[str, str]) -> dict[str, str]:
        if household_id not in self.households:
            self._evict_oldest_if_full(self.households, self.MAX_HOUSEHOLDS, {"demo"})
        clean = dict(info)
        clean.setdefault("business_sector", "Thương mại & Dịch vụ tổng hợp")
        clean.setdefault("revenue_tier", "500m_to_3b")
        clean.setdefault("tax_method", "percentage_revenue")
        self.households[household_id] = clean
        if household_id == "demo":
            self.household_info = dict(clean)
        self._save_snapshot()
        return self.households[household_id]

    def get_household(self, household_id: str) -> dict[str, str]:
        return self.households.get(household_id) or self.household_info

    def save_user(self, phone: str, user_record: dict[str, str]) -> dict[str, str]:
        if phone not in self.users:
            self._evict_oldest_if_full(self.users, self.MAX_USERS)
        self.users[phone] = dict(user_record)
        self._save_snapshot()
        return self.users[phone]

    def get_user_by_phone(self, phone: str) -> dict[str, str] | None:
        return self.users.get(phone)

    @staticmethod
    def _extract_month(date_or_month: str) -> str:
        clean = (date_or_month or "").strip()
        return clean[:7] if len(clean) >= 7 else clean

    def is_period_locked(self, household_id: str, date_or_month: str) -> bool:
        month = self._extract_month(date_or_month)
        if not month:
            return False
        return f"{household_id}:{month}" in self.locked_periods

    def get_period_lock(self, household_id: str, month: str) -> dict[str, str] | None:
        clean_month = self._extract_month(month)
        return self.locked_periods.get(f"{household_id}:{clean_month}")

    def set_period_lock(
        self,
        household_id: str,
        month: str,
        locked: bool,
        actor: str = "Chủ hộ",
    ) -> dict[str, Any]:
        clean_month = self._extract_month(month)
        key = f"{household_id}:{clean_month}"
        if locked:
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            info = {"month": clean_month, "locked_at": now_iso, "locked_by": actor}
            self.locked_periods[key] = info
            self._save_snapshot()
            return {"month": clean_month, "locked": True, **info}
        self.locked_periods.pop(key, None)
        self._save_snapshot()
        return {"month": clean_month, "locked": False, "locked_at": None, "locked_by": None}

    # Agent Repository Protocol methods
    async def find_duplicates(
        self,
        household_id: str,
        counterparty_norm: str | None,
        date_str: str = "",
        amount_vnd: int = 0,
        sha256: str | None = None,
        doc_kind: str | None = None,
        **kwargs,
    ) -> list[Transaction]:
        target_date_str = date_str or kwargs.get("date", "")
        matches: list[Transaction] = []

        # 1. Exact SHA256 match on existing documents
        if sha256:
            matching_doc_ids = {
                d.id
                for d in self.documents.values()
                if d.household_id == household_id and d.sha256 == sha256
            }
            for tx in self.transactions.values():
                if tx.household_id == household_id and tx.status != "rejected":
                    if tx.document_id in matching_doc_ids or any(
                        lid in matching_doc_ids for lid in tx.linked_document_ids
                    ):
                        # Only count if it's an older transaction
                        matches.append(tx)

        # 2. Same amount + within ±1 day (detects cross-modal duplicate between paper invoice and bank transfer!)
        try:
            target_d = date.fromisoformat(target_date_str)
        except ValueError:
            target_d = None

        for tx in self.transactions.values():
            if tx.household_id != household_id or tx.status == "rejected":
                continue
            if tx.amount_vnd != amount_vnd:
                continue

            date_ok = tx.date == target_date_str
            if not date_ok and target_d is not None:
                try:
                    tx_d = date.fromisoformat(tx.date)
                    if abs((target_d - tx_d).days) <= 1:
                        date_ok = True
                except ValueError:
                    pass

            if not date_ok:
                continue

            # If cross-modal (e.g. transfer vs paper receipt), same amount + ±1 day is enough to flag CROSS_DUPLICATE
            if doc_kind == "transfer" or tx.payment_method == "transfer":
                if tx not in matches:
                    matches.append(tx)
                continue

            # Otherwise compare normalized counterparty
            tx_cp = normalize_text(tx.counterparty)
            if not counterparty_norm or not tx_cp or (counterparty_norm in tx_cp or tx_cp in counterparty_norm):
                if tx not in matches:
                    matches.append(tx)

        return matches

    async def price_history(
        self,
        household_id: str,
        item_norm: str,
        counterparty_norm: str | None = None,
        limit: int = 10,
    ) -> list[PricePoint]:
        pts = [
            p
            for p in self.price_points
            if item_norm in p.item_norm or p.item_norm in item_norm
        ]
        return pts[-limit:]

    async def lookup_tax_code(self, tax_code: str) -> TaxCodeInfo | None:
        return self.tax_codes.get(tax_code.strip())

    # CRUD methods for Backend Routers
    def save_document(self, doc: DocumentRecord) -> DocumentRecord:
        if doc.id not in self.documents:
            self._evict_oldest_if_full(self.documents, self.MAX_DOCUMENTS)
        self.documents[doc.id] = doc
        self._save_snapshot()
        return doc

    def get_document(self, doc_id: str) -> DocumentRecord | None:
        return self.documents.get(doc_id)

    def save_job(self, job: JobRecord) -> JobRecord:
        if job.id not in self.jobs:
            self._evict_oldest_if_full(self.jobs, self.MAX_JOBS)
        self.jobs[job.id] = job
        return job

    def get_job(self, job_id: str) -> JobRecord | None:
        return self.jobs.get(job_id)

    def list_transactions(
        self,
        household_id: str = "demo",
        status: str | None = None,
        tx_type: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[Transaction]:
        items = [t for t in self.transactions.values() if t.household_id == household_id]
        if status:
            items = [t for t in items if t.status == status]
        else:
            # By default exclude rejected transactions unless explicitly filtered
            items = [t for t in items if t.status != "rejected"]
        if tx_type:
            items = [t for t in items if t.type == tx_type]
        if date_from:
            items = [t for t in items if t.date >= date_from]
        if date_to:
            items = [t for t in items if t.date <= date_to]

        items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
        return items

    def get_transaction(self, tx_id: str) -> Transaction | None:
        return self.transactions.get(tx_id)

    def save_transaction(self, tx: Transaction) -> Transaction:
        if tx.id not in self.transactions:
            self._evict_oldest_if_full(self.transactions, self.MAX_TRANSACTIONS)
        self.transactions[tx.id] = tx
        self._save_snapshot()
        return tx

    def delete_transaction(self, tx_id: str) -> bool:
        deleted = self.transactions.pop(tx_id, None) is not None
        if deleted:
            self._save_snapshot()
        return deleted


repo = MemoryRepo()
