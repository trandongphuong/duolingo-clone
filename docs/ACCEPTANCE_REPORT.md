# Báo cáo kiểm chứng Hán ngữ biển 1.0

Ngày ghi nhận: **2026-11-10**, múi giờ Asia/Bangkok. Nguồn tiêu chí: `NGHIEM_THU.md` phiên bản 1.0.

**Trạng thái: chưa hoàn thành nghiệm thu cuối cùng.** Build và 41 kiểm thử unit/integration đã PASS. E2E production 9/9 và E2E Docker chặn egress 9/9 đã PASS; backup/restore và transfer đang kiểm chứng, máy airgap/LAN thật độc lập vẫn NOT TESTED; không suy ra PASS từ việc đã viết mã hoặc tài liệu. Đây không phải chứng nhận offline trong mạng LAN thật hay chứng nhận an toàn thông tin của đơn vị.

## Phiên bản và nguồn kiểm chứng

| Thành phần | Giá trị |
|---|---|
| Nhánh | `feat/han-ngu-bien-lan` |
| Nền tảng A | `3da50be` — LAN, xác thực nội bộ và học/chấm điểm tin cậy |
| Chặng B/C | `cd447fd` — biên soạn bảng, import và phiên bản nội dung |
| Hardening | `8660d57` — thu hồi quyền, vá phụ thuộc và tài nguyên offline |
| Node / pnpm | Node **24.22.1**, pnpm **11.11.0**, lockfile cố định |
| Ứng dụng | Hán ngữ biển **1.0.0**, Next.js **16.4.3**, React **19.3.0** |
| DB kiểm thử | PostgreSQL **17.11 Alpine**, dữ liệu/tài khoản giả |
| Trình duyệt | Chromium hệ thống, Playwright; chỉ cho phép origin ứng dụng trong các test |
| Giới hạn môi trường | Cloud Linux, 2 CPU; ổ khoảng 8 GB và Docker `vfs`; đã gặp ENOSPC khi build nhiều layer |

Không có tài khoản, dữ liệu học viên thật hoặc học liệu hạn chế được đưa vào kiểm thử. Image ứng dụng không được chứa `.env`, DB, media của người dùng hoặc thư mục `work`.

## Kết quả lệnh đã có bằng chứng

| Kiểm chứng | Kết quả thực tế | Bằng chứng trong workspace |
|---|---|---|
| Cài phụ thuộc với frozen lockfile | **PASS**, exit 0; không đổi phân giải lockfile | `work/evidence/frozen-install.log`: `Already up to date`, pnpm 11.11.0 |
| Lint | **PASS**, exit 0, không có lỗi/cảnh báo | `work/evidence/lint-final.log`; log rỗng là kết quả bình thường của ESLint khi thành công |
| Typecheck | **PASS**, exit 0 | `work/evidence/typecheck-final.log`; không có chẩn đoán TypeScript |
| Unit + PostgreSQL integration | **PASS**, **41/41**, fail 0, skip 0; khoảng 58,0 giây | `work/evidence/tests-final.log`: `tests 41`, `pass 41`, `fail 0`, `skipped 0` |
| Production build | **PASS**, exit 0; compile 31,1 giây, TypeScript 26,5 giây, tạo 30 trang tĩnh | `work/evidence/build-final.log`; có thông báo standalone đã chuẩn bị, không chứa dữ liệu vận hành |
| Audit dependency production | **PASS**, exit 0; 545 dependency, **0** advisory ở mọi mức | `work/evidence/dependency-audit-final.json`; danh mục tại `docs/DEPENDENCIES.md` |
| E2E production release | **PASS**, 9/9, exit 0, 4,7 phút dưới tải Docker build | `work/evidence/e2e-release.log`, `work/evidence/playwright-release-results.json` |
| Wizard và responsive thật | **PASS**, tạo10từ → sửa lỗi → upload → lưu → duyệt → học20câu → resume/replay; 360/390/768/1440px | Test B01/B04/B07/C02 trong suite9; ảnh `author-*`, `lesson-cards-*`, `learner-progress-*` |
| Tools bundle migrate/seed | **PASS** trên PostgreSQL thử nghiệm; migration đã áp dụng được nhận diện, seed lại tạo 0 bản ghi | `work/evidence/bundled-maintenance.log` |
| Docker app thực + E2E chặn egress | **PASS**, source build → Compose healthy → 9/9 E2E, browser external attempts0 | `docs/verification/e2e-offline-compose.log`, `docker-runtime-offline.log`, `runtime-image-proof.log` |
| Restore và transfer | **NOT TESTED** tại mốc này | Đang kiểm chứng sau khi E2E ngừng ghi dữ liệu |

Hai selector test đã được sửa (alert của Next và label chứa select). Kiểm tra screenshot phát hiện toast chọn khóa báo lỗi sai; server action đã trả đường dẫn sau save, client await rồi điều hướng. Suite release9/9 có regression xác nhận toast sai không còn. Tất cả test trình duyệt chặn origin ngoài và xác nhận không có request Internet được thử.

Log và ảnh minh chứng đã kiểm tra chỉ chứa dữ liệu giả được lưu tại `docs/verification/`; log thô, trace/cookie/mật khẩu và DB/media trong `work/` vẫn bị bỏ qua bởi Git. Báo cáo này giữ kết quả đã quan sát; người nghiệm thu cần chạy lại các lệnh trên bản phát hành mình nhận. Audit 0 advisory không thay thế rà soát bảo mật hoặc chứng minh không tồn tại lỗ hổng chưa công bố.

## Đối chiếu từng tiêu chí

`PASS` chỉ áp dụng cho phạm vi bằng chứng ghi trong dòng. `NOT TESTED` có nghĩa chưa có đủ bằng chứng cho toàn bộ điều kiện, kể cả khi một số bước con đã chạy thành công.

| ID | Mức | Kết quả | Bằng chứng và giới hạn |
|---|---|---|---|
| A01 | Critical | **PASS** | Frozen install, ESLint, TypeScript, 41/41 unit/integration và production build đều exit 0. Các log `*-final` và `frozen-install.log` nêu trên. Lệnh tái lập: `pnpm lint`, `pnpm typecheck`, `TEST_DATABASE_URL="$DATABASE_URL" pnpm test`, `pnpm build`. |
| A02 | Critical | **PASS** | E2E production đăng nhập/đăng xuất learner/author/admin bằng DB local; cookie httpOnly/SameSite=Lax, cookie cũ bị thu hồi sau logout. `e2e-production.log`, các test `A02/A03` trong `tests/e2e/acceptance.spec.ts`; không dùng Clerk. |
| A03 | Critical | **PASS** | E2E guest 401, learner/author 403 ở API admin; author publish 403, CSRF khác origin 403. Unit/integration kiểm role, admin cuối cùng, khóa/reset/thu hồi phiên và actor đã bị khóa/hạ quyền không được ghi bằng quyền chụp từ trước. `tests/auth-policy.test.ts`, `tests/users.integration.test.ts`, `tests/import-content.integration.test.ts`, suite 41 PASS. |
| A04 | Critical | **PASS** | PostgreSQL17Alpine riêng trong Compose; migrate/seed/bootstrap thực và9/9E2E trên app kết nối DB này. Backend Internal=true, service DB không publish port. `compose.yaml`, `compose-health.json`, `docs/verification/e2e-offline-compose.log`. |
| A05 | Critical | **PASS** | SDK Clerk/Neon/Stripe đã gỡ khỏi dependency/runtime; checkout/webhook/paywall đã bỏ. Học liên tục ba bài/60 câu và giữ điểm sau đăng nhập lại đã PASS trong E2E. Tên cột subscription lịch sử không phải một tích hợp thanh toán đang chạy. |
| A06 | Critical | **PASS** trong mô phỏng cloud | App thực trên internal backend không có default IPv4 route, public TCP1.1.1.1:443 bịENETUNREACH. Trong điều kiện đó9/9E2E auth/CSV-XLSX/publish/media/quiz/resume đềuPASS; browser external attempts0. `docs/verification/docker-runtime-offline.log`, `e2e-offline-compose.log`. LAN thật độc lập vẫn chưa được chứng nhận. |
| A07 | Critical | **PASS** | Integration tạo nội dung ngoài bộ mẫu + 137 điểm + attempt/completion, chạy migrate/seed hai lần rồi so sánh nguyên vẹn. Bộ mẫu vẫn 10 bài/100 từ/200 câu/800 lựa chọn; chạy seed lại không tạo thêm. `tests/media-seed.integration.test.ts`, `tests-final.log`. |
| A08 | Critical | **PASS** | SQL projection của learner không lấy `correct`; server kiểm option thuộc câu, bài/khóa đã publish và khóa đang chọn. PostgreSQL regression: 8 request đúng đồng thời chỉ +10 điểm, replay +0, sai +0, lựa chọn khác câu/bài nháp/khóa chưa chọn bị từ chối. `tests/learning.integration.test.ts`, suite 41 PASS. |
| B01 | Critical | **PASS** | E2E wizard tạo khóa/chủ đề/bài, dán10dòng, cố ý thiếu Pinyin rồi sửa ô, upload WAV, preview/lưu20câu, export CSV, author gửi duyệt, admin xuất bản, learner học. Suite release9/9 PASS; `tests/e2e/acceptance.spec.ts`, `work/evidence/e2e-release.log`. |
| B02 | Critical | **PASS** | E2E API nhập CSV UTF-8 BOM và XLSX thật 10 dòng, báo thiếu Pinyin dòng 2, receipt preview rồi lưu. Parser unit kiểm Unicode, quoted/newline, số dòng vật lý, công thức/macro, ZIP bomb, giới hạn 2.000 dòng/5 MB. Transaction import được integration kiểm chứng. `tests/import-vocabulary.test.ts`, E2E `B02/B03/B06`, `tests-final.log`. |
| B03 | Critical | **PASS** | PostgreSQL integration nhập lại update/skip giữ 10 mục/20 câu/80 lựa chọn, source key và ID câu ổn định; không sinh trùng. E2E API lần hai inserted 0/skipped 10. `tests/import-content.integration.test.ts`, E2E `B02/B03/B06`. |
| B04 | Critical | **PASS** | Unit generator kiểm SELECT/ASSIST, đúng một đáp án, lựa chọn có thật/không trùng và xử lý đồng nghĩa giống nhau; server grading integration kiểm đáp án thật. E2E học ba bài mẫu có cả chọn nghĩa/chọn Hanzi và phản hồi server. Wizard khóa mới cũng đã PASS trong suite release9/9. |
| B05 | High | **PASS** | E2E upload WAV sin nguyên bản, serve đúng byte, range 206 và trình duyệt `audio.play()` thành công khi browser chặn origin ngoài; WAV giả trả 400. Unit kiểm MIME/magic/size/path/range; integration kiểm quyền private media và tái sử dụng. `tests/media.test.ts`, `tests/media-authorization.integration.test.ts`, E2E `B05`. Cô lập egress toàn bộ server còn chờ ở A06. Đây không phải giọng Mandarin. |
| B06 | High | **PASS** | E2E API author lưu/gửi duyệt; publish trái quyền 403; learner không thấy khóa trước publish, thấy sau admin publish. Integration giữ bài publish bất biến, chỉ owner/admin soạn và chặn media riêng tư của người khác. E2E `B02/B03/B06`, `tests/import-content.integration.test.ts`. |
| B07 | Critical | **PASS** | E2E production hoàn thành ba bài mẫu, kiểm ít nhất 3/10 bài, logout/login giữ nguyên điểm; PostgreSQL test reload/replay/concurrency giữ tiến độ nhất quán. `sample-three-lessons-progress.png`, E2E `C01/B07`, `tests/learning.integration.test.ts`. Kịch bản khóa tạo bằng wizard đã PASS trong suite release9/9. |
| B08 | High | **PASS** | Integration publish v1 → clone đồng thời → v2/v3, giữ attempt/completion/điểm cũ, archive phiên bản trước, chặn sửa bài publish. Bổ sung chặn tạo bài mới trùng mã trong cùng chủ đề để không thay nhầm family v1. `tests/import-content.integration.test.ts`; migration unique family/version có điều kiện cho mã không rỗng. |
| C01 | High | **PASS** | Seed 10 bài/100 mục Hanzi/Pinyin/VI, unit kiểm không trùng và 200 câu; E2E học liên tục ba bài. UI học/soạn có banner mẫu chưa kiểm duyệt. Font Noto local kèm OFL/checksum; dữ liệu vẫn cần chuyên gia ngôn ngữ thẩm định. `data/`, `tests/media.test.ts`, `tests/media-seed.integration.test.ts`, E2E `C01/B07`. |
| C02 | High | **PASS** | E2E kiểm document không tràn ngang ở360/390/768/1440px cho author, flashcards và tiến độ;15ảnh bằng chứng có Hanzi/Pinyin đúng. Bảng từ cuộn trong khung riêng trên màn nhỏ. Suite release9/9 và `work/evidence/{author,lesson-cards,learner-progress}-*.png`. |
| C03 | Medium | **PASS** | Unit lịch ôn đúng 1/3/7/14 ngày, trả lời sai reset; PostgreSQL test due-review đồng thời chỉ tăng một bước, không cộng điểm lặp. UI `/review` dùng danh sách đến hạn theo chính user, liên kết luyện bài đã publish. `tests/review.test.ts`, `tests/learning.integration.test.ts`, `db/queries.ts`; không có AI. |
| C04 | High | **PASS** | E2E form đăng nhập kiểm label và thứ tự focus bàn phím; screenshot `login-keyboard-focus.png`. Các thao tác quiz là button, nội dung Hanzi/Pinyin/VI làm nội dung thay thế âm thanh, form bảng có aria-label, logo trang trí dùng alt rỗng; CSS có focus và reduced-motion. Đây là kiểm tra cơ bản, chưa phải chứng nhận WCAG toàn ứng dụng. |
| D01 | Critical | **PASS** | Source Docker tools build frozeninstall+Next+TypeScript+bundle thành công; app là metadata-only derivative cùng runtime. Compose mới app/DB/nginx healthy, volumes bền vững,9/9E2E; không dùng host node_modules lúc runtime. `docs/verification/docker-source-tools-pass.log`, `runtime-image-proof.log`, `docker-runtime-offline.log`, `e2e-offline-compose.log`. |
| D02 | Critical | **NOT TESTED** | Script export/load kiểm SHA-256 và image ID đã có; từ chối checksum hỏng từng được kiểm. Xuất/nạp bộ image cuối cùng và chạy `--pull never` còn chờ. **Máy airgap độc lập chưa được thử**; ngay cả nếu export/load cùng Docker daemon PASS, kết luận máy airgap độc lập vẫn NOT TESTED. Xem bảng bước con bên dưới. |
| D03 | Critical | **NOT TESTED** | Script backup DB+media/restore transaction và kiểm archive trước mutation đã có; kiểm traversal/symlink/tar hỏng từng PASS. Chưa có bằng chứng backup rồi restore DB+media thật trên instance thử nghiệm mới và so khớp nội dung cuối. |
| D04 | High | **PASS** | `.env.example` không chứa secret; `.env*`, `work/`, DB dump/cache không đưa vào Git/image. CLI nhận mật khẩu kín qua stdin, không có admin/admin hay tài khoản mặc định; fixture mật khẩu được tạo ngẫu nhiên, không commit. Auth/admin integration kiểm hash không lộ trong kết quả API. `scripts/create-user.ts`, `.gitignore`, `.dockerignore`, suite 41 PASS. |
| D05 | High | **PASS** | Giữ LICENSE MIT upstream; `docs/DEPENDENCIES.md` ghi thư viện/giấy phép, `docs/ASSET_LICENSES.md` và Noto OFL/copyright/checksum. Gỡ tài nguyên upstream chưa rõ quyền khỏi bản phân phối. Audit production cuối 545 dependency, 0 advisory, exit 0. Chỉ audit tập production; không coi là chứng nhận chuỗi cung ứng hoặc ý kiến pháp lý. |
| D06 | Critical | **PASS** | Không chạy deploy công khai/production, không Sites/Vercel deployment; workflow hiện có không tự deploy app. Host thử nghiệm chỉ bind loopback, Compose mặc định LAN_HOST=127.0.0.1; đổi sang IP LAN thật cần phê duyệt. Nhánh riêng/commits giữ lại để review, không merge main. |
| D07 | High | **PASS** | README tiếng Việt có cài dev, biến cấu hình, migration/bootstrap, học/biên soạn/import và giới hạn; `docs/LAN_DEPLOYMENT.md` có build/airgap/no-pull/backup/restore/upgrade/rollback/secrets. Báo cáo này nêu rõ các phần chưa được kiểm chứng. |

## Phân biệt các bước Docker và airgap

| Bước con | Kết quả hiện tại | Khi nào được chuyển PASS |
|---|---|---|
| Build production trên host | **PASS** | Đã có `build-final.log` |
| Bundle công cụ migrate/seed từ dependency đã khóa | **PASS** | Đã chạy với DB thử nghiệm; `bundled-maintenance.log` |
| Đóng gói compact app/tools từ artifact host | **PASS** ở lần thử trước | `docker-package-built.log`; cần đối chiếu lại bộ image cuối với commit/build phát hành |
| Docker source build toàn bộ cuối | **PASS** | `docker-source-tools-pass.log`: frozeninstall → Next build/TypeScript → bundle → image b3759e…; app chỉ đổi CMD từ cùng runtime, wrapper hiện chỉ build source một lần. |
| Compose app/DB/ingress thực + volumes/healthy | **PASS** | Instance mới, DB không publish port, app/DB/nginx healthy. |
| App thực không có public egress + browser auth/import/quiz | **PASS** | Route/egress probe và9/9E2E cùng bộ Compose cuối, external browser attempts0. |
| Export/save bộ image cuối + checksum | **NOT TESTED** | Archive và manifest SHA-256 được tạo/kiểm thành công |
| Load rồi khởi động không pull trên cùng host | **NOT TESTED** | Kiểm image ID đúng; `docker compose up --no-build --pull never` hoạt động |
| Nạp và vận hành trên máy airgap độc lập | **NOT TESTED** | Người vận hành thử trên host khác đã chuẩn bị Docker/OS, không Internet |
| Backup/restore DB + media trên instance mới | **NOT TESTED** | So dữ liệu/điểm/attempt/media trước–sau; không dùng dữ liệu thật |

## Lệnh tái lập

Các lệnh sau dành cho DB/tài khoản giả riêng. Cấu hình `DATABASE_URL`, `SESSION_PASSWORD`, `APP_ORIGIN`, `MEDIA_DIR` bằng cơ chế bí mật được phép; không ghi giá trị vào báo cáo hoặc command history. Khi chạy trực tiếp binary trong `node_modules/.bin`, phụ thuộc phải đã được cài từ lockfile.

```bash
corepack pnpm install --frozen-lockfile
node_modules/.bin/eslint
node_modules/.bin/tsc --noEmit
TEST_DATABASE_URL="$DATABASE_URL" node_modules/.bin/tsx --test tests/*.test.ts
NEXT_TELEMETRY_DISABLED=1 corepack pnpm build
corepack pnpm audit --prod --json
```

Integration tests từ chối DB không có tên `test`/`e2e`; chuẩn bị migration trước. E2E dùng file tài khoản giả riêng đã tạo bằng `scripts/prepare-test-accounts.ts`, không có mật khẩu mặc định:

```bash
node_modules/.bin/tsx scripts/prepare-test-accounts.ts
# Chạy app ở terminal riêng trên cùng DB và storage thử nghiệm.
node scripts/start.mjs
BASE_URL=http://127.0.0.1:3000 \
  TEST_ACCOUNTS_FILE=work/test-accounts.json \
  node_modules/.bin/playwright test
```

Lệnh Docker/airgap/restore cần dùng đúng tham số và bước bảo vệ trong `docs/LAN_DEPLOYMENT.md`. Chuẩn bị image trên máy build có mạng được phép; không cài dependency hoặc build tại máy airgap:

```bash
scripts/docker-build.sh
scripts/offline-export.sh /duong-dan-duoc-phep/han-ngu-bien-images.tar.gz
scripts/offline-load.sh /duong-dan-duoc-phep/han-ngu-bien-images.tar.gz
docker compose up -d --no-build --pull never
scripts/docker-offline-verify.sh
```

Không chạy restore lên DB thật để nghiệm thu. Chỉ đổi D03 sang PASS sau khi restore vào instance mới và đối chiếu cả DB lẫn media.

## Rủi ro và cổng phê duyệt trước phát hành

1. **Kiểm chứng hạ tầng còn chờ:** wizard/responsive production đã PASS; cần chốt Docker/runtime offline/backup/transfer bằng kết quả thực. Máy airgap và LAN thật độc lập vẫn cần người vận hành kiểm thử.
2. **Giới hạn máy build:** Docker `vfs` trên ổ khoảng 8 GB từng hết dung lượng; lỗi build môi trường không được xem là bằng chứng app không chạy, cũng không được bỏ qua để ghi PASS. Có đường đóng gói production artifact nhỏ hơn; cần giữ cùng commit, lockfile và log.
3. **Nội dung và âm thanh:** 100 mục mẫu chưa được chuyên gia duyệt; WAV sin chỉ là fixture kỹ thuật. Cần phê duyệt bản dịch/Pinyin/nội dung chuyên ngành và quyền/chất lượng bản ghi Mandarin trước khi dùng đào tạo chính thức.
4. **LAN production:** tên miền/chứng chỉ HTTPS nội bộ, firewall, IP bind, danh sách vai trò, thời hạn phiên và lịch backup phải được đơn vị quản lý phê duyệt. Không tự triển khai công khai; chưa kiểm chứng hay chứng nhận mạng LAN thật.
5. **Dữ liệu hiện hữu và chuyển giao:** các kiểm thử bảo toàn dùng DB giả. Nâng cấp từ DB upstream có dữ liệu thật hoặc host airgap độc lập cần sao lưu, thử trên bản sao và nghiệm thu quy trình khôi phục; chưa có thử nghiệm dữ liệu thật và không được tự sửa/xóa dữ liệu đó.

Sau khi các kết quả đang chờ được bổ sung, vẫn cần người quản lý duyệt nội dung, cấu hình mạng/TLS, phân quyền production và kiểm thử trên hạ tầng được phép. Báo cáo cloud không tự cấp phép triển khai tại đơn vị.
