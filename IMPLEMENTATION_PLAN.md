# Kế hoạch triển khai Hán ngữ biển 1.0

Nguồn yêu cầu: AGENTS.md, SPEC_CHI_TIET.md, NGHIEM_THU.md, PROMPT_GIAO_VIEC.md tại b4e7b9e.
Nhánh: feat/han-ngu-bien-lan. Không triển khai công khai, không dùng dữ liệu thật.

1. **A — LAN và đăng nhập:** giữ Next/React/Drizzle/PostgreSQL; bỏ Clerk/Neon/Stripe/Google Fonts; session nội bộ, RBAC, migration versioned, kiểm chứng build và luồng học có server grading.
2. **B — Học và biên soạn:** giao diện tiếng Việt/Hanzi/Pinyin, flashcards, wizard khóa/chủ đề/bài, bảng từ, CSV/XLSX preview/validation, publish với nội dung bất biến, media local.
3. **C — Mẫu và ôn tập:** seed idempotent 10 bài/khoảng 100 từ chưa kiểm duyệt, ôn tập đơn giản, responsive/a11y, lưu/resume tiến độ.
4. **D — Kiểm chứng và bàn giao:** unit/integration/E2E, RBAC/CSRF/replay, egress-deny, Docker/airgap/backup restore, giấy phép, README và báo cáo từng mã nghiệm thu.

Mỗi chặng cập nhật IMPLEMENTATION_STATUS.md và commit có thể review. Các chặng tiếp tục tự chủ. Chỉ đánh dấu PASS khi có lệnh/bằng chứng thực tế; runtime offline mô phỏng không thay chứng nhận LAN thật.
