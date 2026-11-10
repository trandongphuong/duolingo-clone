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

## 2026-11-10 — Checkpoint B/C / biên soạn và học liệu

- Đã triển khai wizard/bảng từ, import CSV/XLSX/TSV, preview bắt buộc, xác nhận có receipt, validation theo dòng, export CSV chống formula injection, sinh câu hỏi hai chiều và quản lý phiên bản.
- Đã sửa quyền đọc/tái sử dụng media riêng tư và tạo bài trùng mã trong cùng chủ đề. PASS2 integration PostgreSQL bổ sung, scoped lint PASS.
- Production build PASS (compiled19.9s, TypeScript11.3s,33 static pages), log `work/evidence/build-resume.log`.
- E2E production lần đầu:8 PASS/1 FAIL do selector test role=alert trùng Next route announcer (đã sửa test). Các mục đã PASS thực tế gồm3vai trò login/logout/cookie revoke, guest/RBAC, keyboard labels, CSV/XLSX preview/duplicate/publish, WAV playback/range và học liên tục3bài/60câu/resume. Wizard đầy đủ đang chờ chạy lại trên build cuối.
- Audit phụ thuộc phát hiện12 cảnh báo (1critical,6high,4moderate,1low); đang áp dụng override bản vá tương thích, chưa chấp nhận là đã xử lý trước khi audit lại.
- Runtime Docker compact app/tools đã build thử PASS, maintenance bundle migrate/seed PASS. Chưa chạy Compose app thật/offline E2E/restore; bộ image cũ đang xóa để giải phóng ổ8GB. Không xóa DB/volume.
- Đã phục hồi môi trường sau ENOSPC bằng dừng các installer và xóa đúng cache/.next có thể tạo lại. Mã nguồn, commit và DB được giữ. Nghiệm thu cuối vẫn chưa hoàn thành.

## 2026-11-10 — Hardening và kiểm thử hồi quy

- PASS cài phụ thuộc frozen/offline sau cập nhật lockfile; PASS build production cuối, typecheck. 41/41 unit+integration PASS,0skip (`TEST_DATABASE_URL="$DATABASE_URL" node_modules/.bin/tsx --test tests/*.test.ts`, exit0,58.0s).
- Đã vá phụ thuộc gián tiếp qua override tương thích: DOMPurify3.4.17, brace-expansion1.1.21, decode-uri-component0.5.1, postcss-selector-parser6.1.5 và UUID11.1.1 cho ExcelJS. `pnpm audit --prod --json` PASS exit0:0vulnerabilities/545dependencies.
- Kiểm lại actor active/admin bên trong transaction quản trị, chặn request đang chờ sau khi actor bị khóa/hạ quyền. Regression PostgreSQL đã PASS trong suite41.
- Bổ sung unique index family/version không rỗng, chặn trùng bài; React Admin thật sự chỉ đọc, bỏ rowEdit/bulkDelete và linkEdit. Gỡ icon/mascot/âm thanh upstream chưa rõ quyền khỏi bản phân phối; logo/font local riêng vẫn giữ giấy phép.
- Ngăn tracing volume media/.env/work vào standalone; scripts/start dùng storage absolute để không mất media khi rebuild. Build thật không chứa .env/work/.git trong standalone.
- Đã phục hồi DB giả sang PostgreSQL17Alpine nhỏ hơn; dump/volume cũ bảo toàn. Đang thực hiện Docker source-build tối ưu và E2E cuối. Chưa nghiệm thu cuối.

## 2026-11-10 — Sửa lỗi phát hiện qua E2E

- Wizard E2E thực tế PASS32.4s:10dòng, sửa lỗi Pinyin, upload/play, export, gửi duyệt/admin publish,20câu+mộtcâu sai, reload/replay/logout-login,4kích thước màn hình. Sau sửa2selector của test, suite9/9PASS trên production.
- Kiểm tra ảnh chụp phát hiện toast chọn khóa báo lỗi dù thao tác thành công: đã đổi action trả đường dẫn tin cậy sau save, client await trong async transition rồi điều hướng. Đã build release PASS và đang chạy lại9case có regression không còn toast sai.
- Không coi9/9trước sửa toast là bằng chứng cho bản sửa mới; kết quả mới sẽ bổ sung. Docker source-build đã giải quyết network bằng CA+Node env-proxy; đang kiểm tra giới hạn dung lượng trước runtime/offline/restore.

## 2026-11-10 — E2E release PASS

- Suite release9/9PASS, exit0,4.7phút trong khi Docker build cùng2CPU. Có regression không còn toast chọn khóa sai; guest/3roles/admin UI/CSV/XLSX/media/wizard/resume/replay/3bài mẫu đều qua.
- Kiểm15ảnh và overflow ở360/390/768/1440px: Hanzi/Pinyin/nghĩa/audio local hiển thị đúng; bảng từ chỉ cuộn trong khung riêng. Không có request Internet được thử từ trình duyệt.
- Bằng chứng: `work/evidence/e2e-release.log`, `playwright-release-results.json` và ảnh `author-*`, `lesson-cards-*`, `learner-progress-*`.
- Source Docker tools đã build thành công từ frozen dependency qua Next build+TypeScript+bundle; app sẽ dùng cùng runtime bằng metadata khác. Đang kiểm chứng Compose/offline/backup, chưa ghi PASS cho các tiêu chí này.
