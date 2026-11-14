# Keiki App — Bản Sản Phẩm Hoàn Chỉnh (GDG DevFest Miền Trung 2026)

Thư mục `keiki-app/` chứa trọn bộ mã nguồn sản phẩm hoàn chỉnh của **Keiki**:
- `agent/`: Trợ lý AI đa phương thức dùng **Google Gemini API (`google-genai`)** + 6 công cụ kiểm toán (phát hiện trùng chéo Hóa đơn giấy ↔ Ảnh chuyển khoản VietQR `CROSS_DUPLICATE`, phát hiện đơn giá tăng bất thường `PRICE_ANOMALY`, giải mã giọng nói phương ngữ Miền Trung, phân loại thuế Thông tư 152/2025/TT-BTC và sinh câu hỏi chủ động `clarification_question`).
- `backend/`: Dịch vụ FastAPI hợp nhất kết nối Google Cloud Firestore / MemoryRepo (hỗ trợ snapshot JSON cục bộ, nhật ký kiểm toán `audit_log`, xóa mềm và chốt khóa kỳ `PERIOD_LOCKED`), Google Cloud Storage, phát sự kiện SSE thời gian thực, trợ lý AI Agent Function Calling (`POST /api/agent/chat`), hồ sơ HKD + sao lưu JSON và xuất sổ Excel `.xlsx` 5 sheets chuẩn TT 152/2025/TT-BTC (`S2a-HKD_DoanhThu`, `S2c-HKD_DoanhThuChiPhi`, `S2d-HKD_VatLieuHangHoa`, `S2e-HKD_ChiTietTien`, `HoSoVayVon_NganHang`) tương thích **Google Sheets** + gói `.zip` chứng từ gốc.
- `frontend/`: Ứng dụng React 18 + TypeScript + Tailwind CSS PWA thiết kế theo chủ đề **"Cuốn Sổ Kẻ Ô Ly & Bút Mực Tím"** tối ưu cho tiểu thương lớn tuổi (có nút **Chữ to** và nút **🔊 Nghe Keiki hỏi** đọc giọng tiếng Việt).

---

## 1. Cách chạy nhanh trên máy (1 cổng duy nhất `http://localhost:8080`)

Frontend đã được build sẵn vào thư mục `static/` để FastAPI phục vụ trực tiếp cả giao diện web lẫn API:

```powershell
cd "D:\GDG DevFest MienTrung 2026 - Keiki\keiki-app"
$env:PYTHONPATH="."
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8080
```
Sau đó mở trình duyệt tại: **http://localhost:8080**

*(Nếu muốn chạy riêng Vite dev server để sửa giao diện trực tiếp: chạy `npm run dev` trong `frontend/` tại cổng `http://localhost:5173`).*

---

## 2. Cách bổ sung Google Gemini API & Google Cloud

1. **Bổ sung `GEMINI_API_KEY` trực tiếp trên Giao diện Web (Nhanh nhất):**
   - Mở giao diện Keiki → Bấm nút **"Cấu hình Google Gemini API"** ở góc trên bên phải → Dán `GEMINI_API_KEY` (lấy miễn phí từ [Google AI Studio](https://aistudio.google.com/apikey)) → Bấm **Lưu cấu hình Gemini**.
2. **Hoặc cấu hình qua biến môi trường khi khởi động:**
   ```powershell
   $env:GEMINI_API_KEY="AIzaSy..."
   $env:GEMINI_MODEL="gemini-2.5-flash"
   ```
3. **Triển khai lên Google Cloud Run:**
   ```bash
   gcloud run deploy keiki \
     --source . \
     --region asia-southeast1 \
     --allow-unauthenticated \
     --memory 1Gi --cpu 1 --timeout 300 \
     --min-instances 1 --no-cpu-throttling \
     --set-env-vars GCP_PROJECT=<PROJECT_ID>,GCS_BUCKET=<BUCKET_NAME>,GEMINI_MODEL=gemini-2.5-flash \
     --set-secrets GEMINI_API_KEY=gemini-api-key:latest
   ```
