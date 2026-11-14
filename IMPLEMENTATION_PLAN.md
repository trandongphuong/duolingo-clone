# Kế hoạch triển khai Hán ngữ biển 1.0

Nguồn yêu cầu: AGENTS.md, SPEC_CHI_TIET.md, NGHIEM_THU.md, PROMPT_GIAO_VIEC.md tại b4e7b9e.
Nhánh nền tảng: feat/han-ngu-bien-lan; nhánh hoàn thiện local hiện tại: feat/han-ngu-bien-local-release. Demo Render riêng đã được người dùng cho phép. Kiểm thử tiếp tục chỉ dùng dữ liệu giả.

1. **A — LAN và đăng nhập:** giữ Next/React/Drizzle/PostgreSQL; bỏ Clerk/Neon/Stripe/Google Fonts; session nội bộ, RBAC, migration versioned, kiểm chứng build và luồng học có server grading.
2. **B — Học và biên soạn:** giao diện tiếng Việt/Hanzi/Pinyin, flashcards, wizard khóa/chủ đề/bài, bảng từ, CSV/XLSX preview/validation, publish với nội dung bất biến, media local.
3. **C — Mẫu và ôn tập:** seed idempotent 10 bài/khoảng 100 từ chưa kiểm duyệt, ôn tập đơn giản, responsive/a11y, lưu/resume tiến độ.
4. **D — Kiểm chứng và bàn giao:** unit/integration/E2E, RBAC/CSRF/replay, egress-deny, Docker/airgap/backup restore, giấy phép, README và báo cáo từng mã nghiệm thu.

Mỗi chặng cập nhật IMPLEMENTATION_STATUS.md và commit có thể review. Các chặng tiếp tục tự chủ. Chỉ đánh dấu PASS khi có lệnh/bằng chứng thực tế; runtime offline mô phỏng không thay chứng nhận LAN thật.

## Hoàn thiện bộ cài local — 2026-11-11

1. Rà lại bảo toàn dữ liệu/phân quyền; vá request đang xử lý khi tài khoản bị thu hồi quyền và chạy hồi quy trên PostgreSQL riêng.
2. Bổ sung công cụ PowerShell cho Windows 10/11: cấu hình kín, kiểm tra Docker, nạp image có checksum, khởi động, cấp admin và backup/restore.
3. Hoàn thiện HTTPS LAN bằng chứng chỉ người vận hành cấp; backup/restore có staging/khóa; đóng gói ZIP có manifest/version/provenance, chỉ chứa runtime và hướng dẫn cần thiết.
4. Chạy lint/typecheck/build, unit/integration/E2E, Docker egress-deny, TLS và phục hồi thật trong cloud. Ghi riêng NOT TESTED cho Windows/WSL2 và máy airgap độc lập chưa được tiếp cận; xuất bản RC để người dùng nghiệm thu trên máy đích.
