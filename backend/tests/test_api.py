from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from agent.schemas import AuditLogEntry, Item, Transaction, Warning
from backend.app.main import app
from backend.app.models import DocumentRecord
from backend.app.repositories.memory import repo
from backend.app.services.storage import storage_service


def _seed_household_ledger(hid: str) -> None:
    """Create sample documents and transactions for a registered household during tests."""
    sample_jpg = b"\xff\xd8\xff\xe0\x00\x10JFIF_TEST_RECEIPT"
    for did in ("doc_01", "doc_02"):
        sp = f"{hid}/{did}.jpg"
        storage_service.save_bytes(sp, sample_jpg, "image/jpeg")
        repo.save_document(
            DocumentRecord(
                id=did,
                household_id=hid,
                kind="image" if did == "doc_01" else "transfer",
                mime_type="image/jpeg",
                sha256=f"sha_{did}",
                storage_path=sp,
                uploaded_at="2026-11-12T08:00:00Z",
                preset_hint=None,
            )
        )

    repo.save_transaction(
        Transaction(
            id="txn_01",
            household_id=hid,
            document_id="doc_01",
            linked_document_ids=["doc_01"],
            date="2026-11-12",
            type="expense",
            category="nhap_hang",
            tax_group="khong_tinh_thue",
            payment_method="cash",
            amount_vnd=900000,
            counterparty="Đại lý Nguyên liệu Minh Phát",
            items=[Item(name="Nguyên liệu chế biến", quantity=5, unit_price_vnd=180000, line_total_vnd=900000)],
            status="recorded",
            audit_log=[
                AuditLogEntry(
                    timestamp="2026-11-12T08:00:00Z",
                    action="created",
                    actor="Keiki AI Agent",
                    summary="Khởi tạo bút toán từ chứng từ gốc",
                )
            ],
            source="agent",
            created_at="2026-11-12T08:00:00Z",
            updated_at="2026-11-12T08:00:00Z",
        )
    )
    repo.save_transaction(
        Transaction(
            id="txn_02",
            household_id=hid,
            document_id="doc_02",
            linked_document_ids=["doc_02"],
            duplicate_of_id="txn_01",
            date="2026-11-12",
            type="expense",
            category="nhap_hang",
            tax_group="khong_tinh_thue",
            payment_method="transfer",
            amount_vnd=900000,
            counterparty="Đại lý Nguyên liệu Minh Phát",
            status="needs_review",
            warnings=[
                Warning(
                    code="CROSS_DUPLICATE",
                    severity="high",
                    message="Phát hiện biên lai chuyển khoản trùng khớp với hóa đơn giấy #txn_01.",
                )
            ],
            audit_log=[
                AuditLogEntry(
                    timestamp="2026-11-12T08:05:00Z",
                    action="created",
                    actor="Keiki AI Agent",
                    summary="Khởi tạo bút toán chờ duyệt trùng chéo",
                )
            ],
            source="agent",
            created_at="2026-11-12T08:05:00Z",
            updated_at="2026-11-12T08:05:00Z",
        )
    )
    repo.save_transaction(
        Transaction(
            id="txn_03",
            household_id=hid,
            document_id="doc_01",
            linked_document_ids=["doc_01", "doc_02"],
            date="2026-11-12",
            type="revenue",
            category="ban_hang",
            tax_group="phan_phoi_hang_hoa",
            payment_method="transfer",
            amount_vnd=3500000,
            counterparty="Khách hàng mua sỉ",
            status="recorded",
            audit_log=[
                AuditLogEntry(
                    timestamp="2026-11-12T09:00:00Z",
                    action="created",
                    actor="Chủ hộ",
                    summary="Ghi nhận doanh thu bán hàng",
                )
            ],
            source="manual",
            created_at="2026-11-12T09:00:00Z",
            updated_at="2026-11-12T09:00:00Z",
        )
    )


@pytest.mark.asyncio
async def test_health_and_transactions_and_cross_duplicate_merge():
    repo.reset_to_seed()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Health check (public)
            r_health = await client.get("/api/health")
            assert r_health.status_code == 200
            assert r_health.json()["service"] == "keiki"

            # 2. Register real household account
            r_reg = await client.post(
                "/api/auth/register",
                json={
                    "phone": "0909123456",
                    "password": "RealAccountPassword!123",
                    "owner": "Nguyễn Minh Tâm",
                    "name": "Cửa hàng Thương mại & Dịch vụ Minh Tâm",
                    "tax_code": "0316889912",
                },
            )
            assert r_reg.status_code == 200
            assert "keiki_session" in r_reg.cookies
            hid = r_reg.json()["household"]["id"]
            _seed_household_ledger(hid)

            # 3. List transactions
            r_list = await client.get("/api/transactions")
            assert r_list.status_code == 200
            data = r_list.json()
            assert data["total"] == 3

            # 4. Merge CROSS_DUPLICATE transaction (txn_02 into txn_01)
            r_merge = await client.post(
                "/api/transactions/txn_02/confirm",
                json={"merge_into_duplicate": True},
            )
            assert r_merge.status_code == 200
            merged_tx = r_merge.json()
            assert merged_tx["id"] == "txn_01"
            assert "doc_01" in merged_tx["linked_document_ids"]
            assert "doc_02" in merged_tx["linked_document_ids"]
            assert merged_tx["payment_method"] == "transfer"

            # 5. Report calculation
            r_rep = await client.get("/api/report?period=month&anchor=2026-11-12")
            assert r_rep.status_code == 200
            rep = r_rep.json()
            assert rep["totals"]["revenue_vnd"] == 3500000
            assert rep["loan_readiness"]["cross_verified_count"] >= 2

            # 6. Export TT152 Excel & ZIP
            r_xlsx = await client.get("/api/export?month=2026-11&evidence=false")
            assert r_xlsx.status_code == 200
            assert len(r_xlsx.content) > 2000

            r_zip = await client.get("/api/export?month=2026-11&evidence=true")
            assert r_zip.status_code == 200
            assert len(r_zip.content) > 2000
    finally:
        repo.reset_to_seed()


@pytest.mark.asyncio
async def test_tt152_upgrade_agent_audit_lock_and_profile():
    import io
    import openpyxl

    repo.reset_to_seed()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r_reg = await client.post(
                "/api/auth/register",
                json={
                    "phone": "0905123456",
                    "password": "RealAccountPassword!123",
                    "owner": "Nguyễn Minh Tâm",
                    "name": "Cửa hàng Thương mại & Dịch vụ Minh Tâm",
                },
            )
            assert r_reg.status_code == 200
            hid = r_reg.json()["household"]["id"]
            _seed_household_ledger(hid)

            # 1. Household profile update + JSON backup
            r_prof = await client.patch(
                "/api/household/profile",
                json={
                    "name": "Quán Cà Phê Minh Tâm 152",
                    "owner": "Nguyễn Minh Tâm",
                    "tax_code": "0401999888",
                    "address": "123 Lê Duẩn, Hải Châu, Đà Nẵng",
                    "phone": "0905123456",
                    "business_sector": "Dịch vụ ăn uống",
                    "revenue_tier": "500m_to_3b",
                    "tax_method": "percentage_revenue",
                },
            )
            assert r_prof.status_code == 200
            assert r_prof.json()["household"]["name"] == "Quán Cà Phê Minh Tâm 152"

            r_bak = await client.get("/api/household/backup")
            assert r_bak.status_code == 200
            assert len(r_bak.json()["transactions"]) == 3

            # 2. Circular 152/2025 5 official sheets & household header row
            r_xlsx = await client.get("/api/export?month=2026-11&evidence=false")
            assert r_xlsx.status_code == 200
            wb = openpyxl.load_workbook(io.BytesIO(r_xlsx.content))
            assert set(wb.sheetnames) == {
                "S2a-HKD_DoanhThu",
                "S2c-HKD_DoanhThuChiPhi",
                "S2d-HKD_VatLieuHangHoa",
                "S2e-HKD_ChiTietTien",
                "HoSoVayVon_NganHang",
            }
            s2a = wb["S2a-HKD_DoanhThu"]
            header_val = str(s2a.cell(1, 1).value)
            assert "HỘ, CÁ NHÂN KINH DOANH: QUÁN CÀ PHÊ MINH TÂM 152" in header_val
            assert "MST: 0401999888" in header_val

            # 3. AI Agent function calling (summary + merge duplicate)
            r_chat_sum = await client.post(
                "/api/agent/chat",
                json={"message": "Tháng này thu chi, thuế và hồ sơ vay vốn ra sao?", "month": "2026-11"},
            )
            assert r_chat_sum.status_code == 200
            chat_sum = r_chat_sum.json()
            assert len(chat_sum["tool_calls"]) >= 1
            assert any(tc["tool_name"] == "get_period_financial_summary" for tc in chat_sum["tool_calls"])

            r_chat_merge = await client.post(
                "/api/agent/chat",
                json={"message": "Gộp giúp tôi chứng từ nghi trùng đang chờ kiểm tra", "month": "2026-11"},
            )
            assert r_chat_merge.status_code == 200
            chat_merge = r_chat_merge.json()
            assert chat_merge["data_updated"] is True
            assert any(tc["tool_name"] == "execute_merge_duplicate" for tc in chat_merge["tool_calls"])

            # 4. Audit trail on PATCH + soft-delete on DELETE
            r_patch = await client.patch(
                "/api/transactions/txn_01",
                json={"counterparty": "Đại lý Nguyên liệu Minh Phát (Đã soát)"},
            )
            assert r_patch.status_code == 200
            assert len(r_patch.json()["audit_log"]) >= 2

            r_del = await client.delete("/api/transactions/txn_01")
            assert r_del.status_code == 204
            tx_rejected = (await client.get("/api/transactions?status=rejected")).json()["items"]
            soft_del_tx = next(t for t in tx_rejected if t["id"] == "txn_01")
            assert soft_del_tx["status"] == "rejected"
            assert soft_del_tx["audit_log"][-1]["action"] == "rejected"

            # 5. Period Lock enforces 409 PERIOD_LOCKED until unlocked
            r_lock = await client.post("/api/report/lock", json={"month": "2026-11"})
            assert r_lock.status_code == 200
            assert r_lock.json()["locked"] is True

            r_blocked = await client.post(
                "/api/transactions",
                json={
                    "date": "2026-11-12",
                    "type": "revenue",
                    "payment_method": "cash",
                    "amount_vnd": 100000,
                    "counterparty": "Test locked",
                },
            )
            assert r_blocked.status_code == 409
            assert r_blocked.json()["error"]["code"] == "PERIOD_LOCKED"

            r_unlock = await client.post("/api/report/unlock", json={"month": "2026-11"})
            assert r_unlock.status_code == 200
            assert r_unlock.json()["locked"] is False

            # 6. Clear API key endpoint
            r_clr = await client.delete("/api/settings/apikey")
            assert r_clr.status_code == 200
            assert r_clr.json()["gemini_configured"] is False
    finally:
        repo.reset_to_seed()


@pytest.mark.asyncio
async def test_voice_text_and_upload_without_api_key_reports_clear_error(monkeypatch):
    import asyncio
    from backend.app.config import settings

    repo.reset_to_seed()
    orig_key = settings.gemini_api_key
    settings.gemini_api_key = ""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r_reg = await client.post(
                "/api/auth/register",
                json={
                    "phone": "0912345678",
                    "password": "ProdPassword!123",
                    "owner": "Trần Văn Bình",
                    "name": "Cửa hàng Bình Minh",
                },
            )
            assert r_reg.status_code == 200

            # 1. Voice text submission works
            r_voice = await client.post(
                "/api/documents/voice-text",
                json={
                    "transcript": "Hôm nay xuất bán 20 đơn hàng bán lẻ tổng cộng 800 nghìn đồng, khách trả tiền mặt."
                },
            )
            assert r_voice.status_code == 201
            job_id = r_voice.json()["job_id"]

            for _ in range(30):
                r_job = await client.get(f"/api/jobs/{job_id}")
                if r_job.json()["status"] in ("done", "error"):
                    break
                await asyncio.sleep(0.1)

            r_job = await client.get(f"/api/jobs/{job_id}")
            assert r_job.json()["status"] == "done"
            assert r_job.json()["transaction_id"] is not None

            # 2. Uploading a real image when GEMINI_API_KEY is missing sets preset_hint=None and reports error instead of returning fake "Cà phê hạt"
            r_up = await client.post(
                "/api/documents",
                files={"file": ("hoa_don_dien.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF_REAL_RECEIPT_DATA", "image/jpeg")},
                data={"kind": "image"},
            )
            assert r_up.status_code == 201
            doc_id = r_up.json()["document_id"]
            img_job_id = r_up.json()["job_id"]
            assert repo.get_document(doc_id).preset_hint is None

            for _ in range(30):
                r_img_job = await client.get(f"/api/jobs/{img_job_id}")
                if r_img_job.json()["status"] in ("done", "error"):
                    break
                await asyncio.sleep(0.1)

            r_img_job = await client.get(f"/api/jobs/{img_job_id}")
            assert r_img_job.json()["status"] == "error"
            assert "GEMINI_API_KEY" in (r_img_job.json()["error"] or "")
    finally:
        settings.gemini_api_key = orig_key
        repo.reset_to_seed()
