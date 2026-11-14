from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from agent.normalize import normalize_text
from agent.schemas import PricePoint, TaxCodeInfo, Transaction
from backend.app.core.security import get_household_token_version, set_household_token_version
from backend.app.models import DocumentRecord, JobRecord
from backend.app.services.storage import storage_service


AGENT_DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "agent" / "data"
STATE_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "keiki_runtime_state.json"


class MemoryRepo:
    """In-memory repository with atomic disk persistence and period locks."""

    MAX_HOUSEHOLDS = 5000
    MAX_USERS = 5000
    MAX_DOCUMENTS = 5000
    MAX_TRANSACTIONS = 10000
    MAX_JOBS = 2000
    MAX_TRANSACTIONS_PER_HOUSEHOLD = 2500
    MAX_DOCUMENTS_PER_HOUSEHOLD = 1000

    def __init__(self, persist: bool = True) -> None:
        self.documents: dict[str, DocumentRecord] = {}
        self.transactions: dict[str, Transaction] = {}
        self.jobs: dict[str, JobRecord] = {}
        self.price_points: list[PricePoint] = []
        self.tax_codes: dict[str, TaxCodeInfo] = {}
        self.households: dict[str, dict[str, str]] = {}
        self.users: dict[str, dict[str, str]] = {}
        self.locked_periods: dict[str, dict[str, str]] = {}
        self.household_info: dict[str, str] = {}
        self._persistence_enabled: bool = persist
        self._firestore_db: Any = None
        if persist and os.environ.get("GCP_PROJECT", "").strip():
            try:
                from google.cloud import firestore

                self._firestore_db = firestore.Client(project=os.environ.get("GCP_PROJECT", "").strip())
            except Exception:
                self._firestore_db = None
        self._load_reference_data()
        self._load_snapshot()

    def _load_reference_data(self) -> None:
        self.documents.clear()
        self.transactions.clear()
        self.jobs.clear()
        self.price_points.clear()
        self.tax_codes.clear()
        self.households.clear()
        self.users.clear()
        self.locked_periods.clear()
        self.household_info.clear()

        # Load reference tax codes & price history from agent/data
        tax_file = AGENT_DATA_DIR / "tax_codes.json"
        if tax_file.exists():
            for row in json.loads(tax_file.read_text(encoding="utf-8")):
                info = TaxCodeInfo.model_validate(row)
                self.tax_codes[info.tax_code] = info

        price_file = AGENT_DATA_DIR / "price_history.json"
        if price_file.exists():
            for row in json.loads(price_file.read_text(encoding="utf-8")):
                self.price_points.append(PricePoint.model_validate(row))

    def _load_snapshot(self) -> None:
        if not self._persistence_enabled:
            return
        if self._firestore_db is not None:
            try:
                col = self._firestore_db.collection("keiki_state")
                doc_snap = col.document("runtime_snapshot").get()
                if doc_snap.exists:
                    payload = doc_snap.to_dict() or {}
                    if not payload.get("split_mode"):
                        self._apply_snapshot_payload(payload)
                        return
                meta_snap = col.document("meta_snapshot").get()
                if meta_snap.exists:
                    meta_payload = meta_snap.to_dict() or {}
                    if meta_payload.get("split_mode"):
                        txs_merged: dict[str, Any] = {}
                        for idx in range(int(meta_payload.get("tx_chunk_count", 0))):
                            c_snap = col.document(f"tx_chunk_{idx}").get()
                            if c_snap.exists:
                                txs_merged.update((c_snap.to_dict() or {}).get("items") or {})
                        docs_merged: dict[str, Any] = {}
                        for idx in range(int(meta_payload.get("doc_chunk_count", 0))):
                            c_snap = col.document(f"doc_chunk_{idx}").get()
                            if c_snap.exists:
                                docs_merged.update((c_snap.to_dict() or {}).get("items") or {})
                        full_payload = {
                            "households": meta_payload.get("households") or {},
                            "users": meta_payload.get("users") or {},
                            "locked_periods": meta_payload.get("locked_periods") or {},
                            "transactions": txs_merged,
                            "documents": docs_merged,
                        }
                        self._apply_snapshot_payload(full_payload)
                        return
            except Exception:
                pass
        if not STATE_FILE.exists():
            return
        try:
            payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            self._apply_snapshot_payload(payload)
        except Exception:
            pass

    def _apply_snapshot_payload(self, payload: dict[str, Any]) -> None:
        for hid, hh in (payload.get("households") or {}).items():
            hh_dict = dict(hh)
            self.households[str(hid)] = hh_dict
            if hh_dict.get("token_version"):
                try:
                    ver = int(hh_dict["token_version"])
                    if ver > get_household_token_version(str(hid)):
                        set_household_token_version(str(hid), ver)
                except Exception:
                    pass
        for phone, usr in (payload.get("users") or {}).items():
            usr_dict = dict(usr)
            self.users[str(phone)] = usr_dict
            if usr_dict.get("household_id") and usr_dict.get("token_version"):
                try:
                    hid_str = str(usr_dict["household_id"])
                    ver = int(usr_dict["token_version"])
                    if ver > get_household_token_version(hid_str):
                        set_household_token_version(hid_str, ver)
                except Exception:
                    pass
        for doc_id, doc_raw in (payload.get("documents") or {}).items():
            self.documents[str(doc_id)] = DocumentRecord.model_validate(doc_raw)
        for tx_id, tx_raw in (payload.get("transactions") or {}).items():
            self.transactions[str(tx_id)] = Transaction.model_validate(tx_raw)
        for lock_key, lock_info in (payload.get("locked_periods") or {}).items():
            self.locked_periods[str(lock_key)] = dict(lock_info)

    @staticmethod
    def _chunk_dict_by_bytes(data_dict: dict[str, Any], max_bytes: int = 650_000) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        current: dict[str, Any] = {}
        current_bytes = 2
        for k, v in data_dict.items():
            entry_bytes = len(json.dumps({k: v}, ensure_ascii=False).encode("utf-8"))
            if current and current_bytes + entry_bytes > max_bytes:
                chunks.append(current)
                current = {}
                current_bytes = 2
            current[k] = v
            current_bytes += entry_bytes
        if current:
            chunks.append(current)
        return chunks

    def _save_snapshot(self) -> None:
        if not self._persistence_enabled:
            return
        households_snap = {
            hid: (
                {**hh, "token_version": str(get_household_token_version(hid))}
                if get_household_token_version(hid) > 1 or "token_version" in hh
                else dict(hh)
            )
            for hid, hh in self.households.items()
        }
        users_snap = {}
        for phone, usr in self.users.items():
            u_copy = dict(usr)
            hid_str = str(u_copy.get("household_id") or "")
            if hid_str and (get_household_token_version(hid_str) > 1 or "token_version" in u_copy):
                u_copy["token_version"] = str(
                    max(int(u_copy.get("token_version") or 1), get_household_token_version(hid_str))
                )
            users_snap[phone] = u_copy

        docs_snap = {k: v.model_dump() for k, v in self.documents.items()}
        txs_snap = {k: v.model_dump() for k, v in self.transactions.items()}
        payload = {
            "households": households_snap,
            "users": users_snap,
            "documents": docs_snap,
            "transactions": txs_snap,
            "locked_periods": self.locked_periods,
        }
        serialized = json.dumps(payload, ensure_ascii=False)
        if self._firestore_db is not None:
            try:
                col = self._firestore_db.collection("keiki_state")
                if len(serialized.encode("utf-8")) < 950_000:
                    col.document("runtime_snapshot").set(payload)
                else:
                    tx_chunks = self._chunk_dict_by_bytes(txs_snap)
                    doc_chunks = self._chunk_dict_by_bytes(docs_snap)
                    for idx, chunk in enumerate(tx_chunks):
                        col.document(f"tx_chunk_{idx}").set({"items": chunk})
                    for idx, chunk in enumerate(doc_chunks):
                        col.document(f"doc_chunk_{idx}").set({"items": chunk})
                    col.document("meta_snapshot").set(
                        {
                            "split_mode": True,
                            "tx_chunk_count": len(tx_chunks),
                            "doc_chunk_count": len(doc_chunks),
                            "households": households_snap,
                            "users": users_snap,
                            "locked_periods": self.locked_periods,
                        }
                    )
                    col.document("runtime_snapshot").set({"split_mode": True, "meta_doc": "meta_snapshot"})
            except Exception:
                pass
        try:
            STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = STATE_FILE.with_suffix(".tmp")
            tmp_path.write_text(serialized, encoding="utf-8")
            os.replace(tmp_path, STATE_FILE)
        except Exception:
            pass

    def reset_to_seed(self) -> None:
        """Reset all runtime state and reload only reference catalogs."""
        self._load_reference_data()
        try:
            if STATE_FILE.exists():
                STATE_FILE.unlink()
        except Exception:
            pass

    @staticmethod
    def _evict_oldest_if_full(store: dict, max_items: int, protected_keys: set[str] | None = None) -> list[Any]:
        evicted: list[Any] = []
        if len(store) < max_items:
            return evicted
        for k in list(store.keys()):
            if protected_keys and k in protected_keys:
                continue
            val = store.pop(k, None)
            if val is not None:
                evicted.append(val)
            if len(store) < max_items:
                break
        return evicted

    def _active_household_ids(self) -> set[str]:
        active = {t.household_id for t in self.transactions.values() if t.household_id}
        for lk in self.locked_periods:
            if ":" in lk:
                active.add(lk.split(":", 1)[0])
        return active

    def save_household(self, household_id: str, info: dict[str, str]) -> dict[str, str]:
        if household_id not in self.households:
            self._evict_oldest_if_full(
                self.households,
                self.MAX_HOUSEHOLDS,
                protected_keys=self._active_household_ids(),
            )
        clean = dict(info)
        clean.setdefault("business_sector", "Thương mại & Dịch vụ tổng hợp")
        clean.setdefault("revenue_tier", "500m_to_3b")
        clean.setdefault("tax_method", "percentage_revenue")
        self.households[household_id] = clean
        self._save_snapshot()
        return self.households[household_id]

    def get_household(self, household_id: str) -> dict[str, str]:
        return self.households.get(household_id) or self.household_info

    def save_user(self, phone: str, user_record: dict[str, str]) -> dict[str, str]:
        if phone not in self.users:
            active_hids = self._active_household_ids()
            protected_phones = {
                p for p, u in self.users.items() if u.get("household_id") in active_hids
            }
            self._evict_oldest_if_full(
                self.users,
                self.MAX_USERS,
                protected_keys=protected_phones,
            )
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
        clean_item = (item_norm or "").strip()
        if len(clean_item) < 2:
            return []
        pts: list[PricePoint] = [
            p
            for p in self.price_points
            if len(p.item_norm) >= 2 and (clean_item in p.item_norm or p.item_norm in clean_item)
        ]
        if household_id:
            for tx in self.transactions.values():
                if tx.household_id != household_id or tx.status != "recorded" or tx.type != "expense":
                    continue
                tx_cp_norm = normalize_text(tx.counterparty) or None
                for it in tx.items:
                    it_norm = normalize_text(it.name)
                    if (
                        len(it_norm) >= 2
                        and it.unit_price_vnd > 0
                        and (clean_item in it_norm or it_norm in clean_item)
                    ):
                        pts.append(
                            PricePoint(
                                item_norm=it_norm,
                                counterparty_norm=tx_cp_norm,
                                unit_price_vnd=it.unit_price_vnd,
                                date=tx.date,
                            )
                        )
        if counterparty_norm:
            cp_pts = [
                p
                for p in pts
                if p.counterparty_norm and (counterparty_norm in p.counterparty_norm or p.counterparty_norm in counterparty_norm)
            ]
            if len(cp_pts) >= 3:
                return cp_pts[-limit:]
        return pts[-limit:]

    async def lookup_tax_code(self, tax_code: str) -> TaxCodeInfo | None:
        return self.tax_codes.get(tax_code.strip())

    # CRUD methods for Backend Routers
    def save_document(self, doc: DocumentRecord) -> DocumentRecord:
        if doc.id not in self.documents:
            evicted_docs: list[DocumentRecord] = []
            if doc.household_id:
                hh_docs = [k for k, d in self.documents.items() if d.household_id == doc.household_id]
                while len(hh_docs) >= self.MAX_DOCUMENTS_PER_HOUSEHOLD:
                    oldest_hh_doc = hh_docs.pop(0)
                    ev = self.documents.pop(oldest_hh_doc, None)
                    if ev is not None:
                        evicted_docs.append(ev)
            other_tenant_docs = {
                k for k, d in self.documents.items() if d.household_id and d.household_id != doc.household_id
            }
            for ev in self._evict_oldest_if_full(
                self.documents, self.MAX_DOCUMENTS, protected_keys=other_tenant_docs
            ):
                if isinstance(ev, DocumentRecord):
                    evicted_docs.append(ev)
            for ev in evicted_docs:
                if ev.storage_path and not any(
                    d.storage_path == ev.storage_path for d in self.documents.values()
                ):
                    storage_service.delete_bytes(ev.storage_path)
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
        household_id: str = "",
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
            if tx.household_id:
                hh_txs = [k for k, t in self.transactions.items() if t.household_id == tx.household_id]
                while len(hh_txs) >= self.MAX_TRANSACTIONS_PER_HOUSEHOLD:
                    # Prefer evicting soft-deleted ('rejected') transactions of the same household first
                    rejected_k = next(
                        (k for k in hh_txs if self.transactions[k].status == "rejected"),
                        hh_txs[0],
                    )
                    hh_txs.remove(rejected_k)
                    self.transactions.pop(rejected_k, None)
            other_tenant_txs = {
                k for k, t in self.transactions.items() if t.household_id and t.household_id != tx.household_id
            }
            self._evict_oldest_if_full(self.transactions, self.MAX_TRANSACTIONS, protected_keys=other_tenant_txs)
        self.transactions[tx.id] = tx
        self._save_snapshot()
        return tx

    def delete_transaction(self, tx_id: str) -> bool:
        deleted = self.transactions.pop(tx_id, None) is not None
        if deleted:
            self._save_snapshot()
        return deleted


repo = MemoryRepo()
