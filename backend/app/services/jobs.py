from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncIterator

from agent.api import process_document
from agent.schemas import AgentContext, AgentSettings, DocumentRef, Transaction
from backend.app.config import settings
from backend.app.models import JobEventRecord, JobRecord
from backend.app.repositories.memory import MemoryRepo, repo


class JobRunner:
    """Orchestrates asynchronous Gemini Agent jobs and broadcasts real-time SSE events."""

    def __init__(self, repository: MemoryRepo) -> None:
        self.repo = repository
        self._queues: dict[str, list[asyncio.Queue[JobEventRecord | None]]] = {}

    def _broadcast(self, job_id: str, event: JobEventRecord | None) -> None:
        for q in self._queues.get(job_id, []):
            q.put_nowait(event)

    def start_job(
        self,
        doc_ref: DocumentRef,
        household_id: str = "demo",
    ) -> JobRecord:
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        job = JobRecord(
            id=job_id,
            household_id=household_id,
            document_id=doc_ref.document_id,
            status="running",
            events=[],
        )
        self.repo.save_job(job)
        self._queues[job_id] = []
        asyncio.create_task(self._run_agent(job_id, doc_ref, household_id))
        return job

    async def _run_agent(
        self,
        job_id: str,
        doc_ref: DocumentRef,
        household_id: str,
    ) -> None:
        job = self.repo.get_job(job_id)
        if not job:
            return

        ctx = AgentContext(
            household_id=household_id,
            repo=self.repo,
            settings=AgentSettings(
                gemini_api_key=settings.gemini_api_key or None,
                gemini_model=settings.gemini_model,
            ),
        )

        try:
            async for ev in process_document(doc_ref, ctx):
                if ev.step == "done" and "transaction" in ev.data:
                    tx_dict = dict(ev.data["transaction"])
                    tx_id = f"txn_{uuid.uuid4().hex[:8]}"
                    tx_dict["id"] = tx_id
                    tx = Transaction.model_validate(tx_dict)
                    self.repo.save_transaction(tx)
                    job.transaction_id = tx_id

                    save_ev = JobEventRecord(
                        job_id=job_id,
                        seq=ev.seq,
                        step="save",
                        status="ok",
                        message=f"Đã lưu bút toán (Mã: {tx_id}) vào hệ thống sổ kế toán.",
                        data={"transaction_id": tx_id},
                    )
                    job.events.append(save_ev)
                    self._broadcast(job_id, save_ev)

                    done_ev = JobEventRecord(
                        job_id=job_id,
                        seq=ev.seq + 1,
                        step="done",
                        status=ev.status,
                        message=ev.message,
                        data={
                            "transaction_id": tx_id,
                            "decision": ev.data.get("decision", tx.status),
                            "clarification_question": ev.data.get("clarification_question"),
                            "transaction": tx.model_dump(),
                        },
                    )
                    job.events.append(done_ev)
                    job.status = "done"
                    self.repo.save_job(job)
                    self._broadcast(job_id, done_ev)
                else:
                    rec = JobEventRecord(
                        job_id=job_id,
                        seq=ev.seq,
                        step=ev.step,
                        status=ev.status,
                        message=ev.message,
                        data=ev.data,
                    )
                    job.events.append(rec)
                    if ev.step == "error" or ev.status == "error":
                        job.status = "error"
                        job.error = ev.message
                    self.repo.save_job(job)
                    self._broadcast(job_id, rec)
        except Exception:
            safe_msg = "Lỗi nội bộ khi xử lý chứng từ. Hệ thống đã ghi nhận để kiểm tra."
            err_ev = JobEventRecord(
                job_id=job_id,
                seq=len(job.events) + 1,
                step="error",
                status="error",
                message=safe_msg,
                data={"code": "INTERNAL_ERROR"},
            )
            job.events.append(err_ev)
            job.status = "error"
            job.error = safe_msg
            self.repo.save_job(job)
            self._broadcast(job_id, err_ev)
        finally:
            self._broadcast(job_id, None)

    async def stream_events(self, job_id: str) -> AsyncIterator[str]:
        job = self.repo.get_job(job_id)
        if not job:
            return

        q: asyncio.Queue[JobEventRecord | None] = asyncio.Queue()
        self._queues.setdefault(job_id, []).append(q)

        try:
            sent_seqs: set[int] = set()
            for existing in list(job.events):
                sent_seqs.add(existing.seq)
                yield f"data: {json.dumps(existing.model_dump(), ensure_ascii=False)}\n\n"

            if job.status in ("done", "error"):
                return

            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15.0)
                    if ev is None:
                        break
                    if ev.seq not in sent_seqs:
                        sent_seqs.add(ev.seq)
                        yield f"data: {json.dumps(ev.model_dump(), ensure_ascii=False)}\n\n"
                    if ev.step in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            if job_id in self._queues and q in self._queues[job_id]:
                self._queues[job_id].remove(q)


job_runner = JobRunner(repo)
