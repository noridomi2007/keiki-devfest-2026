from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.config import settings
from backend.app.main import app
from backend.app.repositories.memory import repo


@pytest.mark.asyncio
async def test_health_and_transactions_and_cross_duplicate_merge():
    repo.reset_to_seed()
    orig_demo = settings.demo_mode
    settings.demo_mode = True
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Health check (public)
            r_health = await client.get("/api/health")
            assert r_health.status_code == 200
            assert r_health.json()["service"] == "keiki"

            # 2. Authenticate via demo preset in DEMO_MODE=true to receive HttpOnly session cookie
            r_login = await client.post(
                "/api/auth/login",
                json={
                    "owner": "Nguyễn Minh Tâm",
                    "name": "Cửa hàng Thương mại & Dịch vụ Minh Tâm",
                    "auth_method": "preset",
                },
            )
            assert r_login.status_code == 200
            assert "keiki_session" in r_login.cookies

            # 3. List transactions
            r_list = await client.get("/api/transactions")
            assert r_list.status_code == 200
            data = r_list.json()
            assert data["total"] >= 7

            # 4. Merge CROSS_DUPLICATE transaction (txn_seed_02 into txn_seed_01)
            r_merge = await client.post(
                "/api/transactions/txn_seed_02/confirm",
                json={"merge_into_duplicate": True},
            )
            assert r_merge.status_code == 200
            merged_tx = r_merge.json()
            assert merged_tx["id"] == "txn_seed_01"
            assert "doc_seed_01" in merged_tx["linked_document_ids"]
            assert "doc_seed_02" in merged_tx["linked_document_ids"]
            assert merged_tx["payment_method"] == "transfer"

            # 5. Report calculation
            r_rep = await client.get("/api/report?period=month&anchor=2026-11-12")
            assert r_rep.status_code == 200
            rep = r_rep.json()
            assert rep["totals"]["revenue_vnd"] > 0
            assert rep["loan_readiness"]["cross_verified_count"] >= 2

            # 6. Export TT152 Excel & ZIP
            r_xlsx = await client.get("/api/export?month=2026-11&evidence=false")
            assert r_xlsx.status_code == 200
            assert len(r_xlsx.content) > 2000

            r_zip = await client.get("/api/export?month=2026-11&evidence=true")
            assert r_zip.status_code == 200
            assert len(r_zip.content) > 2000
    finally:
        settings.demo_mode = orig_demo


@pytest.mark.asyncio
async def test_tt152_upgrade_agent_audit_lock_and_profile():
    import io
    import openpyxl

    repo.reset_to_seed()
    orig_demo = settings.demo_mode
    settings.demo_mode = True
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r_login = await client.post(
                "/api/auth/login",
                json={
                    "owner": "Nguyễn Minh Tâm",
                    "name": "Cửa hàng Thương mại & Dịch vụ Minh Tâm",
                    "auth_method": "preset",
                },
            )
            assert r_login.status_code == 200

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
            assert len(r_bak.json()["transactions"]) >= 7

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
                "/api/transactions/txn_seed_01",
                json={"counterparty": "Đại lý Cà phê Minh Phát (Đã soát)"},
            )
            assert r_patch.status_code == 200
            assert len(r_patch.json()["audit_log"]) >= 2

            r_del = await client.delete("/api/transactions/txn_seed_01")
            assert r_del.status_code == 204
            tx_rejected = (await client.get("/api/transactions?status=rejected")).json()["items"]
            soft_del_tx = next(t for t in tx_rejected if t["id"] == "txn_seed_01")
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
        settings.demo_mode = orig_demo
        repo.reset_to_seed()


@pytest.mark.asyncio
async def test_production_voice_text_works_when_demo_disabled():
    import asyncio

    repo.reset_to_seed()
    orig_demo = settings.demo_mode
    settings.demo_mode = False
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
    finally:
        settings.demo_mode = orig_demo
        repo.reset_to_seed()
