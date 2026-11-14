# EVAL_RESULTS.md — Kết quả Đo Độ Chính Xác Thực Nghiệm (Keiki AI Agent)

| Chỉ số đánh giá | Kết quả đo thật | Ghi chú |
|---|---|---|
| Tổng số kịch bản kiểm thử chuẩn | **6** | Hóa đơn giấy, VietQR trùng chéo, Giá bất thường, Giọng nói Miền Trung |
| Độ chính xác trích xuất Số tiền (`amount_vnd`) | **100.0%** (6/6) | Khớp tuyệt đối số nguyên VND |
| Độ chính xác trích xuất Ngày (`date`) | **100.0%** (6/6) | Bao gồm giải mã từ khóa thời gian phương ngữ ("sáng ni") |
| **Tỷ lệ Tự ghi sổ đúng (Auto-Record Precision)** | **100.0%** (2/2) | Không có giao dịch sai nào bị tự ý ghi vào sổ |
| **Bắt trùng chéo Hóa đơn ↔ Chuyển khoản (`CROSS_DUPLICATE`)** | **100.0%** (1/1) | Phát hiện và gợi ý gộp chứng từ thành công |
| Độ chính xác Quyết định (`recorded` vs `needs_review`) | **100.0%** (6/6) | Chặn đúng 100% ca giá bất thường, lệch tổng và mơ hồ |
| Độ trễ xử lý trung bình (Pipeline Latency) | **1068.0 ms** | Luồng sự kiện SSE thời gian thực |
