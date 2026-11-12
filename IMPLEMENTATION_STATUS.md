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

## 2026-11-10 — Docker và offline runtime PASS

- Source Docker tools build PASS: frozeninstall34.8s, Next compile105s, TypeScript/static generation/bundle thành công, imageb3759e… App dùng cùng runtime chỉ đổiCMD; wrapper đã đổi sang một lần sourcebuild để không lặp install khi context thay đổi.
- Compose mới app+PostgreSQL17Alpine+nginx healthy; DB không publish port, backendInternal=true. Đã sửa ingress healthcheck bị proxy môi trường can thiệp bằng clearproxyenv ở runtime.
- PASS network thực: app không có defaultIPv4route; publicTCP1.1.1.1:443 trảENETUNREACH.
- PASS9/9E2E trên Compose trong điều kiện chặn egress, exit0,1.9phút: nhập/publish/âm thanh/quiz/tiến độ/roles/responsive đều hoạt động; browser không thử request ra origin ngoài.
- Các log/ảnh chỉ chứa dữ liệu giả đã chọn lưu `docs/verification/`; trace,secret,DBdump/media không commit. Đang kiểm chứng backup/restore, recreate và xuất/nạp image. Máy LAN/airgap thật độc lập vẫn NOT TESTED; chưa nghiệm thu cuối.

## 2026-11-10 — Bàn giao D / kết quả cuối trong cloud

- PASS recreate app đổiIP khi nginx vẫn chạy và recreateDB giữvolumes: fingerprintDB vàSHA2tệpmedia không đổi.
- PASS xuất/nạp archive251MiB, SHAarchive+manifest và4imageIDs, khởi động lại bằng `--no-build --pull never` không registry trên cùngdaemon.
- PASS backupscript và restore thật sang project/volumes mới. Đã sửa race initdb bằng chờpg_isready trướcpg_restore; script chạyexit0.
- Saurestore:3khóa/12bài/120mục/240câu/960lựa chọn/82attempts/80completion/800điểm/40reviews/3users/2media, fingerprintvàSHAmedia khớp trước–sau. Đây là dữ liệuE2Egiả, không phải số lượng bộmẫu chuẩn10bài/100mục.
- PASS browser trêninstancephục hồi: adminreport800điểm+4bài tổng; learner800điểm+3/10bài trongkhóa; WAV8044byte phát0.25s; logout→401; khôngrequestInternet.
- PASS typecheckrelease vàbash/node syntax lầncuối; Git scan không có .env thật, dump,archive,testaccountsecrets trong trackedfiles. Chỉ.env.example được theo dõi.
- `docs/ACCEPTANCE_REPORT.md`:26PASS/0FAIL/1NOT TESTED. D02máyairgapđộc lập chưa kiểm chứng; LANthật chưa được chứng nhận. Không tuyên bố hoàn thành nghiệm thu cuối, không merge main, không deploy công khai.
- Evidence đã lọc chỉdữliệugiả tại `docs/verification/`. Archivebinary,DBdump,media,secrets/trace giữngoàiGit trongwork; scriptscho phép táitạo gói trên máybuild được phép.

## 2026-11-10 — Chuẩn bị demo Internet theo yêu cầu mới

- Người dùng đã cho phép triển khai demo để truy cập trực tiếp. Tạo nhánh `feat/han-ngu-bien-demo` từ `96a4d5e`; dùng dữ liệu giả, database và volume media riêng. Bản LAN tiếp tục được nghiệm thu tại PR #1.
- Thêm `demo:bootstrap` cho source và maintenance bundle: xác thực HTTPS/cookie/secrets, yêu cầu database demo mới hoặc marker hợp lệ, migrate → seed → tạo admin trong transaction có advisory lock. Chạy lại không reset tài khoản; từ chối nâng quyền hoặc mở khóa tài khoản trùng tên. Không có mật khẩu mặc định hoặc secret trong log.
- PASS: full lint (`node_modules/.bin/eslint`), full typecheck (`tsc --noEmit --incremental false`), 5/5 guard tests, production Next build + prepare standalone và đóng gói allowlist maintenance bundle. Bundle từ chối cấu hình thiếu cờ demo với exit 1 đúng dự kiến, trước khi kết nối DB.
- PASS tích hợp maintenance bundle trên PostgreSQL riêng trong container Node 24 hiện có: bootstrap DB mới với 10 bài/100 từ và admin bcrypt cost 12; chạy lại giữ nguyên mật khẩu/tài khoản/nội dung; từ chối trùng tên learner hoặc admin bị khóa; từ chối DB có bảng chưa có marker và giữ nguyên sentinel. Hai database thử riêng và tệp tạm đã được dọn sau kiểm thử.
- NOT TESTED: bootstrap chế độ source kết nối DB thật. Kết nối từ host tới PostgreSQL trong Docker bridge trả `ECONNREFUSED` trước khi tạo DB; đã kiểm chứng bundle qua tuyến mạng private của app. Đây là giới hạn kiểm thử source-mode, không ghi thành PASS.
- Hosting: đã tìm và đề xuất Railway, nhưng trạng thái kết nối kiểm tra vẫn chưa cài/kết nối; không có quyền hosting/SSH được cấu hình. Chưa tạo dịch vụ, database hoặc khoản phí. Cần người dùng kết nối tài khoản hosting trước khi có thể cấp tài nguyên và kiểm tra chi phí.
- NOT TESTED: provisioning hosting, HTTPS/domain thật, volume trên hosting, bootstrap và E2E tại URL công khai; chưa có URL demo đã xác minh. Không coi localhost hoặc preview QA nội bộ là đường dẫn người dùng truy cập được.
- Bằng chứng chặng demo: `docs/verification/demo-bootstrap.txt`. Chưa build image Docker mới cho thay đổi bootstrap; đã bundle và kiểm chứng runtime command, tiếp tục build/deploy sau khi có quyền hosting.

## 2026-11-10 — Cấu hình Render Free theo lựa chọn của người dùng

- Người dùng chọn Render sau khi được thông tin giới hạn Free. Thêm `render.yaml` với web Docker và PostgreSQL 17 `hnb_demo`, cả hai `plan: free`, cùng Singapore; database chặn public IP, web dùng URL private. Auto-deploy tắt; không yêu cầu disk hoặc tài nguyên trả phí.
- Entry point riêng `render-start.mjs` xác thực cờ demo, ánh xạ `RENDER_EXTERNAL_URL` thành HTTPS origin, bootstrap trước khi mở web, bind `0.0.0.0`, chuyển tín hiệu dừng và loại secret admin khỏi child web. Không cần pre-deploy hook/shell/one-off job vốn không có ở Free.
- Thêm thông báo dữ liệu giả/media tạm tại trang đăng nhập và màn hình chính; đặt trong vùng nội dung để thanh điều hướng mobile không che cảnh báo. Database Free hết hạn 30 ngày; media mất khi ngủ/restart/deploy. Đây là giới hạn bản demo, không thay đổi yêu cầu lưu bền của bộ LAN.
- PASS: 11/11 kiểm thử demo+Render (0 fail/0 skip), gồm origin/cookie/port, thứ tự bootstrap→web, bootstrap lỗi không mở web, secret admin không vào child web và SIGTERM ở hai giai đoạn. Full lint, typecheck, Next production build (compile 3.8s, TypeScript 9.8s) và đóng gói standalone/maintenance PASS. YAML parse và kiểm cấu hình Free/private DB/secrets/startup PASS.
- PASS runtime mới với PostgreSQL giả riêng, chạy trong container Node 24 hiện có bằng user `node`: ghi/đọc/xóa media tạm, bootstrap trước HTTP readiness, `/sign-in` HTTP 200 với thông báo lưu trữ tạm trong HTML, startup lần hai giữ nguyên tài khoản/hash mật khẩu/nội dung. SIGTERM ở hai lần chạy trả 143; log không chứa secrets. Database thử duy nhất và runtime/tệp tạm đã được dọn; không sửa cấu hình hoặc restart container hiện có.
- Render đã kết nối; người dùng xác nhận dùng `Tony's workspace` cho 1 web Free + 1 PostgreSQL Free. Hai secrets khởi tạo được Render sinh ngẫu nhiên, chủ tài khoản xem mật khẩu admin qua Dashboard; không cần gửi bí mật vào chat. Chưa tạo dịch vụ hoặc phát sinh chi phí. Có liên kết trang tạo Blueprint từ nhánh demo tại `docs/RENDER_DEMO.md`, đây chưa phải URL ứng dụng.
- NOT TESTED: xác thực Blueprint với workspace, build/deploy trên Render, HTTPS/domain thật, đăng nhập/E2E công khai. Không ghi triển khai PASS trước khi mở được URL thật. Bằng chứng và giới hạn kiểm thử sẽ lưu tại `docs/verification/render-demo.txt`.

## 2026-11-10 — Demo Render đã Live

- Người dùng kết nối Render và xác nhận `Tony's workspace` cho 1 web Free + 1 PostgreSQL Free. Blueprint planning PASS trên commit `375ef60`, đúng hai hành động tạo mới, không sửa tài nguyên khác; cả hai Free ở Singapore, DB private, manual env rỗng, auto-sync/auto-deploy tắt. Đã áp dụng trong phạm vi triển khai demo được cho phép.
- FAIL đã sửa: deploy đầu `dep-dbpha58n74is73dvand0` build xong Next/runtime nhưng lỗi BuildKit `invalid user index: -1` tại `COPY --link --chown=node:node`. Commit `86baddd` dùng numeric UID/GID `1000:1000`; deploy lại `dep-dbphbh0m7kps73auku9g` **PASS/Live**. Render xác nhận Live và log seed/admin/bootstrap PASS, Next lắng nghe cổng 10000.
- URL thật do Render cấp: `https://hnb-demo-web-xpuz.onrender.com/sign-in`. Username `demo_admin`; mật khẩu ngẫu nhiên do Render sinh, chủ tài khoản xem secret `DEMO_ADMIN_PASSWORD` trong Environment của web service. Không đọc hoặc công bố secret trong log/Git.
- PostgreSQL `hnb-demo-db-xpuz` available/Free, database `hnb_demo`, IP allowlist rỗng; hết hạn **10/12/2026** theo metadata Render. Web `hnb-demo-web-xpuz` Free, không có persistent disk; media tạm theo giới hạn đã thông báo.
- NOT TESTED: public-client/browser/đăng nhập/E2E hosted. Curl qua proxy bị CONNECT 403; Chromium lỗi tunnel; công cụ web không truy cập được URL. Đây là hạn chế môi trường, không suy ra ứng dụng FAIL. Tool SQL bị DB private từ chối; không mở DB public. Upload hosted/cookie hosted/thử sleep/expiry và billing overage chưa kiểm chứng.
- Bằng chứng `docs/verification/render-hosting.txt`, `docs/verification/render-public.txt`; kiểm thử local vẫn PASS theo `render-demo.txt`. Render Live không đồng nghĩa hoàn tất nghiệm thu toàn bộ hoặc chứng nhận airgap độc lập D02.

## 2026-11-11 — Local release / rà soát quyền ghi

- Người dùng yêu cầu tiếp tục tới bản triển khai local và xác nhận máy đích Windows 10/11. Tạo nhánh `feat/han-ngu-bien-local-release`; giữ demo Render hiện tại, không đổi hạ tầng cloud.
- Rà lại đầy đủ đặc tả/nghiệm thu. Đã bổ sung kiểm tra active/role và khóa actor trong transaction create/save/publish/media, trước khóa nội dung; request bắt đầu trước khi tài khoản bị khóa/hạ quyền không còn ghi bằng quyền cũ. Upload lỗi chỉ dọn file vừa tạo thành công, không xóa nhầm file tồn tại.
- PASS full unit+PostgreSQL integration trên DB giả mới `hnb_local_release_test`: **65/65**, fail0/skip0, exit0,30.3s. Bao gồm 6 race create/save/publish × khóa/hạ quyền, giữ nguyên lịch sử/137điểm; 12 fault tests cho export/backup/restore. Lint/typecheck trước build PASS.
- Đang bổ sung PowerShell native, TLS overlay và gói ZIP offline; build/E2E mới và HTTP regression thu hồi quyền upload đang thực hiện. Chưa ghi PASS cho các phần chưa chạy. Máy Windows/airgap độc lập vẫn NOT TESTED.
- Đã dừng/xóa đúng containers của project restore giả cũ để giải phóng dung lượng, bảo toàn toàn bộ named volumes/backup. DB mới chỉ chứa dữ liệu kiểm thử; không chạm dữ liệu thật.

## 2026-11-12 — Local release / công cụ Windows và vận hành

- Đã khôi phục môi trường sau tạm dừng; kiểm tra Docker/socket và DB giả trước khi tiếp tục. Unit/integration mới nhất **75/75 PASS**, fail0/skip0,31.4s; standalone browser **9/9 PASS**,2.1phút; HTTP upload bị hạ quyền/khóa **2race PASS** với kiểm DB/files không đổi.
- Bổ sung PowerShell5.1-compatible native entry point, common transport binary/UTF8, Start/Doctor kiểm context/localLinux/amd64 và imageID, Configure RNG/ACL, LoadImages exactSHA, CreateAdmin stdin, Backup/Restore staging. pwsh7.6.9/Linux **13smokechecks PASS**; đây chưa phải kiểm chứng Windows5.1/NTFS/Docker thật.
- Công cụ Bash backup/restore/export/load đã hardening staging/khóa/publication; **22faulttests PASS**, gồm checksum thiếu/trùng/đường dẫn lạ và dump hỏng trước ghi DB. TLS overlay thay HTTP publication bằng một cổng TLS, DB private.
- Builder ZIP Python stdlib **11guardtests PASS**; nguồn sạch, imageversion/provenance/ID và allowlist; không có Node/Python/source runtime trên máy đích. Chuẩn bị draft download bằng GitHub standard public runner và Release assets; không dùng artifact storage tính phí hoặc publish release cuối.
- [Báo cáo RC](docs/LOCAL_RELEASE_REPORT.md) ghi phạm vi hiện có. Source Docker/TLS/Composeoffline/restore mới và gói tải thực vẫn đang thực hiện; chưa ghi PASS các mục này. D02 và máy Windows đích vẫn NOT TESTED.
