# Nhật ký triển khai

## 2026-11-09 — Khởi đầu / b4e7b9e

- Đã đọc toàn bộ tài liệu yêu cầu và mẫu CSV; fetch/fast-forward tài liệu người dùng mới đưa lên origin/main.
- Nhánh riêng: `feat/han-ngu-bien-lan`; upstream code `32aa164`.
- Audit: Clerk trong layout/auth/actions/queries, Neon HTTP DB, Stripe checkout/webhook, Google Fonts build; API wildcard CORS; seed upstream xóa dữ liệu; quiz tin client và cộng điểm lặp.
- Baseline PASS: `corepack pnpm lint` (exit 0); `corepack pnpm exec tsc --noEmit --incremental false` (exit 0).
- Chưa chạy seed upstream và không có dữ liệu thật được thay đổi. Baseline build/DB/E2E/offline: NOT TESTED.
- Đang thực hiện A; chưa hoàn thành nghiệm thu.

## 2026-11-10 — Checkpoint A / nền tảng LAN và học tập

- Đã thay Clerk bằng bcrypt12 + iron-session + phiên thu hồi trong PostgreSQL; ba vai trò, CLI cấp tài khoản, quản trị tài khoản và đổi mật khẩu. Không mở signup.
- Đã chuyển Neon HTTP sang pg pool, bỏ Stripe/checkout/webhook/SDK cloud và Google Fonts; thêm font Noto local có giấy phép, logo riêng, CSP và kiểm tra same-origin. React Admin nâng cao chỉ đọc; telemetry tắt.
- Đã có migration versioned/checksum/khóa, chấm đáp án server trong transaction, unique progress chống điểm lặp, flashcard Hanzi/Pinyin/VI, resume và ôn tập.
- PASS thực tế: migration chạy2 lần; seed10 bài/100 từ/200 câu, chạy lại0 bản ghi mới. PostgreSQL regression:8 request đúng đồng thời chỉ+10 điểm, replay0, sai0, từ chối lựa chọn ngoài câu/khóa chưa chọn/bài nháp; payload không chứa correct.
- PASS thực tế: kiểm thử tài khoản/reset/khóa/đổi mật khẩu/thu hồi phiên; kiểm thử seed+migrate giữ nguyên khóa/điểm137/attempt/completion của fixture ngoài bộ mẫu. Unit run trước:36 PASS,1 integration SKIP (sau đó integration riêng đã PASS).
- Lint/typecheck trước checkpoint PASS; build lần đầu FAIL tại TypeScript của tệp test UUID (đã sửa, đang chạy lại). E2E lần đầu bị timeout khi dev/build nhiều tiến trình tranh2CPU; chưa có kết luận E2E. Các lần kiểm chứng được tiếp tục trên production server.
- Không triển khai công khai, không dùng tài khoản/nội dung thật. Chưa hoàn thành nghiệm thu cuối.

## 2026-11-10 — B/C đang kiểm chứng

- Wizard khóa/chủ đề/bài, bảng chỉnh/sắp xếp/lọc, CSV/XLSX/TSV preview có lỗi dòng và receipt xác nhận, nhập transaction/idempotent, gửi duyệt/admin publish, phiên bản bất biến giữ lịch sử.
- Media local kiểm MIME/magic/stream limit/UUID/range; đang bổ sung quyền đọc media theo chủ sở hữu hoặc nội dung đã publish.
- PASS parser/generator19 unit tests; integration nhập10 mục/20 câu/80 options lặp không tăng số lượng, quyền author/admin, receipt giả, clone đồng thời, v2/v3 giữ lịch sử/điểm. PASS media/seed9 tests, font kiểm149/149 ký tự Hanzi mẫu và dấu Việt/Pinyin.
- NOT TESTED tại checkpoint: E2E toàn luồng/responsive/a11y, production Docker app, backup/restore, airgap transfer độc lập, LAN thật.

## 2026-11-10 — D đang thực hiện

- Dockerfile/Compose có image digest, nginx ingress, app/DB internal network, volume/healthcheck; script backup/restore/export/load/checksum đã viết.
- PASS probe network với app giả: HTTP200 qua nginx, app không có default route, public TCP ENETUNREACH. PASS kiểm archive traversal/symlink/corrupt và checksum sai bị từ chối trước mutation.
- FAIL lần build tools do rootless Docker vfs hết dung lượng trên ổ8GB. Đang tối ưu và dọn đúng cache thử nghiệm; bảo toàn DB test. Chưa ghi PASS cho Docker app thực.
