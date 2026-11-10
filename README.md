# Hán ngữ biển 1.0

Ứng dụng học tiếng Trung giản thể, Pinyin và nghĩa tiếng Việt trong mạng LAN. Phát triển từ Lingo bằng Next.js/React, React Admin, Drizzle và PostgreSQL. Giữ giấy phép MIT và bản quyền upstream trong `LICENSE`.

**Học liệu mẫu chưa kiểm duyệt.** 10 bài/100 mục chỉ để thử phần mềm. Chưa có bản ghi phát âm Mandarin được thẩm định. Nội dung hàng hải công khai không thay thế IMO SMCP tiếng Anh. Xem `IMPLEMENTATION_STATUS.md` và `docs/ACCEPTANCE_REPORT.md` để biết kiểm thử thực tế; chưa được chứng nhận offline trong mạng thật.

## Chạy phát triển với dữ liệu giả

Cần Node 24, Corepack/pnpm 11.11.0 và PostgreSQL 17. Không cần tài khoản Clerk/Neon/Stripe hay API bên ngoài.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env.local
```

Sửa `.env.local`: `DATABASE_URL` trỏ PostgreSQL thử nghiệm; `SESSION_PASSWORD` là chuỗi ngẫu nhiên ít nhất 32 ký tự (tạo bằng `openssl rand -base64 48`); `APP_ORIGIN` bằng URL truy cập chính xác. Chỉ demo HTTP cô lập dùng `SESSION_SECURE=false`; production HTTPS dùng `true`. Đặt `MEDIA_DIR` ở thư mục bền vững, mặc định `./work/media` cho phát triển. Không đưa `.env`, mật khẩu, dữ liệu học viên lên Git.

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
# Bash: nhập mật khẩu kín (ít nhất 12 ký tự, tối đa 72 byte UTF-8).
read -rs HNB_INITIAL_PASSWORD
printf '%s' "$HNB_INITIAL_PASSWORD" | corepack pnpm auth:create quantri admin 'Quản trị thử nghiệm'
unset HNB_INITIAL_PASSWORD
NEXT_TELEMETRY_DISABLED=1 corepack pnpm dev --hostname 127.0.0.1
```

Tạo tài khoản author/learner tại **Tài khoản** sau khi admin đăng nhập, hoặc dùng CLI `auth:create`. Không có đăng ký công khai, mật khẩu mặc định hay tài khoản tự tạo khi khởi động. Khóa/reset mật khẩu thu hồi phiên đang mở; người học tự đổi mật khẩu tại Tài khoản.

Migration versioned có checksum và khóa đồng thời. Chạy lại không xóa dữ liệu. Seed chỉ thêm bộ mẫu chưa tồn tại, không ghi đè khóa do người biên soạn tạo hoặc tiến độ. Không dùng lệnh `db:prod` cũ; entry point cũ đã được thay bằng seed an toàn. Với DB upstream chưa có lịch sử migration của bản này, sao lưu và thử quy trình chuyển đổi trên bản sao trước; không tự áp dụng lên dữ liệu thật.

## Soạn khóa và học

1. Author đăng nhập → **Biên soạn** → tạo khóa/chủ đề/bài trong một biểu mẫu.
2. Dán 10 dòng từ Excel (Hanzi, Pinyin, nghĩa Việt), nhập CSV/XLSX hoặc sửa từng dòng. File mẫu tại `templates/vocabulary_sample.csv`; bộ mẫu100 mục tại `data/vocabulary_sample_100.csv`.
3. **Xem trước** để nhận lỗi từng dòng và câu hỏi tự sinh. Sửa lỗi → xem trước lại → **Xác nhận lưu bản nháp**. Có lựa chọn bỏ qua trùng hoặc cập nhật toàn bộ bảng nháp. Mỗi lần tối đa 2.000 dòng/5MB; không chạy macro/công thức XLSX.
4. Author **Gửi duyệt**; admin xem lại → **Xuất bản**. Học viên chỉ thấy khóa/bài đã xuất bản. Bài đã xuất bản khóa sửa; tạo phiên bản nháp mới để giữ nguyên lịch sử cũ.
5. Học viên chọn khóa → học thẻ Hanzi/Pinyin/nghĩa → luyện chọn nghĩa/chọn chữ. Server chấm đáp án và chỉ cộng10 điểm lần đầu cho mỗi câu. Đăng xuất/đăng nhập hoặc tải lại vẫn giữ tiến độ.
6. Kết quả cho phép đánh dấu từ chưa nhớ. Ôn tập có lịch đơn giản1/3/7/14 ngày; trả lời sai đưa từ về cần ôn. Không dùng AI.

Âm thanh tải ở chi tiết từng dòng. Chỉ nhận MP3/WAV/OGG, ảnh PNG/JPEG/WebP, kiểm tra MIME/chữ ký/dung lượng; tài nguyên lưu volume nội bộ và phục vụ có xác thực. `data/test-tone.wav` là âm sin do dự án tạo, **không phải giọng đọc Trung**, chỉ dùng kiểm tra upload/play. Người quản lý phải xác nhận quyền sử dụng và chất lượng bản ghi trước khi đưa vào giáo trình.

Trang `/admin` giữ React Admin cho quản trị nâng cao, chỉ đọc. Thay đổi nội dung qua Biên soạn để mọi thao tác dùng chung khóa/transaction phiên bản. Xóa hàng loạt/cascade bị chặn để giữ lịch sử. Luồng phổ thông là `/author`; không phải nhập từng `challengeOption`. Telemetry React Admin bị tắt.

## Kiểm thử

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
NEXT_TELEMETRY_DISABLED=1 corepack pnpm build
```

Unit tests chạy không cần DB. Integration tests cần `TEST_DATABASE_URL` trỏ DB riêng có tên chứa `test` hoặc `e2e` (xem kiểm tra bảo vệ của từng test); tuyệt đối không dùng dữ liệu thật. Áp dụng migration trước. Đặt `DATABASE_URL` cùng DB khi chạy toàn bộ integration vì worker dùng kết nối chung.

```bash
TEST_DATABASE_URL="$DATABASE_URL" corepack pnpm test
# Chỉ trên DB giả có tên chứa test: tạo fixture không có mật khẩu cố định.
corepack pnpm exec tsx scripts/prepare-test-accounts.ts
# Khởi động app trên DB đó, sau đó:
BASE_URL=http://127.0.0.1:3000 corepack pnpm test:e2e
```

E2E đọc tài khoản từ `work/test-accounts.json` không được theo dõi Git; Chromium hệ thống `/usr/bin/chromium` hoặc `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Playwright trên máy mới cần Chromium và phụ thuộc đã chuẩn bị từ trước nếu airgap. Các bài integration tạo/xóa fixture riêng; một số E2E để lại khóa mang tên kiểm thử trong DB giả để kiểm tra resume.

## Docker LAN, airgap, sao lưu và khôi phục

Xem `docs/LAN_DEPLOYMENT.md`: build image đã khóa digest, app/DB trong network không có route Internet; Nginx chỉ nhận cổng bind đã cấu hình. Postgres không publish port. Có healthcheck, volume DB/media, tools image để migrate/bootstrap/seed khi không Internet.

```bash
cp .env.example .env
# Sửa secrets và origin, chỉ dùng giá trị giả khi thử nghiệm.
bash scripts/docker-build.sh
docker compose --env-file .env up -d db
docker compose --env-file .env --profile tools run --rm tools npm run db:migrate
# Bootstrap theo hướng dẫn LAN_DEPLOYMENT, sau đó:
docker compose --env-file .env up -d --no-build --pull never
bash scripts/docker-offline-verify.sh
```

`offline-export.sh`/`offline-load.sh` tạo/kiểm SHA-256 và image IDs. `docker-backup.sh` sao lưu DB+media nhất quán; `docker-restore.sh` kiểm archive rồi khôi phục vào instance thử nghiệm. Đọc kỹ tham số và bước xác nhận trong tài liệu trước khi restore. Không xóa volume khi cập nhật. Bản xuất image không chứa DB, tài khoản, `.env` hay media người học.

Production phải được phê duyệt tên miền/chứng chỉ HTTPS nội bộ, cấu hình firewall, role và chính sách backup. Không có tự triển khai công khai. Kiểm thử mô phỏng egress-deny trong cloud và nạp image lại trên cùng host không chứng nhận một máy airgap/LAN thật độc lập.

## Tài liệu dự án

- `SPEC_CHI_TIET.md`, `NGHIEM_THU.md`, `PROMPT_GIAO_VIEC.md`: yêu cầu và tiêu chí gốc.
- `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`: kế hoạch, tiến độ và quyết định.
- `docs/ACCEPTANCE_REPORT.md`: PASS/FAIL/NOT TESTED từng tiêu chí và bằng chứng.
- `docs/ASSET_LICENSES.md`: nguồn/giấy phép font, logo, ngữ liệu, âm thử nghiệm.
- `docs/DEPENDENCIES.md`: phụ thuộc và kết quả kiểm tra chuỗi cung ứng.
- `docs/DEMO_DEPLOYMENT.md`: bản demo Internet dùng dữ liệu giả đã được cho phép; yêu cầu hosting, secrets và bootstrap database riêng.
