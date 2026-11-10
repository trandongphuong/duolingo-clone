# Cài đặt và vận hành Hán ngữ biển trong LAN

Chỉ dùng dữ liệu giả để thử nghiệm cloud. Tài liệu này không phải phê duyệt triển khai production hay chứng nhận an toàn thông tin. Máy LAN thật, tên miền, chứng chỉ, firewall, tài khoản và nội dung chuyên ngành cần được người quản lý phê duyệt. Không chuyển database chứa người dùng thật vào gói image.

## Hai giai đoạn riêng biệt

- **Máy build có Internet được phép:** cài dependency từ lockfile, build app và tools, lấy PostgreSQL và nginx từ digest đã chốt, xuất image. `Dockerfile` khóa Node bằng SHA-256; helper chung `scripts/docker-pull-bases.sh` khóa nguồn PostgreSQL/nginx cho cả hai đường build bằng SHA-256. Khi nâng version phải review digest và chạy lại kiểm thử.
- **Máy chủ LAN không Internet:** cùng kiến trúc CPU với image đã build, đã cài Docker Engine + Compose tương thích, chỉ nạp image đã xuất, kiểm checksum và image ID, chạy với `--no-build --pull never`. Không chạy `pnpm install`, `docker build`, tải font hoặc pull registry ở đây. Việc chuẩn bị bộ cài Docker Engine/phụ thuộc OS của đơn vị nằm ngoài image ứng dụng.

`compose.yaml` chạy app, PostgreSQL riêng, nginx ingress và volume media. PostgreSQL không publish port. Mạng `lan_backend` có `internal: true` để app/DB/tools không có egress Internet. Nginx chuyển tiếp HTTP từ cổng LAN vào mạng này; chỉ nginx có giao diện ingress. Docker 29 bỏ port publish khi container chỉ gắn mạng `internal`, vì vậy reverse proxy là cần thiết để vừa truy cập LAN vừa cô lập egress của app. Không chạy mã nghiệp vụ trong nginx. Cổng app mặc định chỉ bind `127.0.0.1`; người quản trị chọn IP LAN được phê duyệt để mở cho học viên. Không đổi thành public preview.

## 1. Build và đóng gói trên máy được phép truy cập mạng

Chạy ở thư mục repository. Docker phải hoạt động; đủ dung lượng cho image, build cache và archive. Build thực tế không cần khóa Clerk, Neon hoặc Stripe.

```bash
scripts/docker-build.sh
scripts/offline-export.sh /duong-dan-duoc-phep/han-ngu-bien-images.tar.gz
```

### Cách đóng gói từ production build đã kiểm thử

Máy build dùng storage driver `vfs` cần nhiều dung lượng cho bản sao layer khi cài toàn bộ development dependency trong Docker. Nếu máy build hạn chế dung lượng, có thể build trên host với dependency/lockfile đã chốt rồi đóng gói cùng artifact production:

```bash
corepack pnpm install --frozen-lockfile
NEXT_TELEMETRY_DISABLED=1 corepack pnpm build
scripts/docker-package-built.sh
scripts/offline-export.sh /duong-dan-duoc-phep/han-ngu-bien-images.tar.gz
```

`docker-package-built.sh` chỉ nhận build production thành công, chuẩn bị artifact theo danh sách cho phép, giữ symlink dependency tương đối và kiểm không chứa `.env`, `.git` hay thư mục `work`. Công cụ migrate/seed/bootstrap được bundle thành CJS bằng esbuild từ dependency đã khóa; image không cần `tsx`, `pnpm install` hoặc cây development dependencies lúc runtime. App và tools dùng chung các layer nhỏ, khác lệnh khởi động. Đường fallback cũng nạp PostgreSQL/nginx theo digest cố định trước khi export; không phụ thuộc image có sẵn ngẫu nhiên trên host. Giữ commit nguồn và log build cùng bản phát hành; không trộn artifact từ commit khác. Đây là cách build tương đương được phép, không phải thao tác build trên máy airgap.

Trong managed Codex Cloud, script tự dùng `$CODEX_PROXY_CERT` dưới dạng BuildKit secret khi có; CA/proxy của phiên không được nhúng vào runtime image. Không vô hiệu hóa kiểm tra TLS. Nếu dùng môi trường proxy khác, cấu hình Docker/CA theo quy định của môi trường đó trước khi build.

Có thể dùng đuôi `.tar.gz`/`.tgz` để export nén theo luồng, không tạo bản tar trung gian lớn; `docker load` tự giải nén. Với `.tar`, export không nén.

Gói bàn giao gồm ba file `han-ngu-bien-images.tar`, `.tar.images`, `.tar.sha256`, cùng `compose.yaml`, `.env.example`, thư mục `scripts/`, `docs/docker/nginx.conf`, tài liệu vận hành và commit nguồn. `.images` ghi image ID chính xác; `.sha256` bảo vệ cả archive và manifest. Checksum phát hiện lỗi truyền; chỉ nhận gói từ nguồn build đáng tin cậy, checksum không tự chứng minh danh tính bên phát hành. Nếu đổi `HANNGU_IMAGE`, `HANNGU_TOOLS_IMAGE`, `POSTGRES_IMAGE`, `NGINX_IMAGE`, đặt cùng giá trị biến môi trường khi build, export và trên máy LAN. Không ghi đè tag image của bản phát hành cũ.

## 2. Cấu hình riêng trên máy LAN

Tạo `.env` riêng từ `.env.example`, giới hạn quyền đọc cho người vận hành, không commit. Tối thiểu đặt:

- `POSTGRES_USER`, `POSTGRES_DB`: tên DB riêng cho ứng dụng.
- `POSTGRES_PASSWORD`: secret ngẫu nhiên. Compose ghép vào URI PostgreSQL, nên dùng chuỗi hex để tránh lỗi ký tự đặc biệt; ví dụ sinh bằng `openssl rand -hex 32` trên máy quản trị. Không dùng mật khẩu trong ví dụ hoặc tài khoản mặc định.
- `SESSION_PASSWORD`: secret ngẫu nhiên ít nhất 32 ký tự, khác mật khẩu DB; có thể sinh bằng `openssl rand -hex 32`.
- `SESSION_SECURE=true` khi chạy production qua HTTPS; `false` chỉ cho demo HTTP cô lập đã được phép. Cookie Secure không hoạt động qua HTTP thường.
- `SESSION_TTL_SECONDS`: thời hạn phiên (Compose mặc định 12 giờ).
- `APP_ORIGIN`: origin thực của ứng dụng. Production dùng `https://...` trên tên miền LAN có chứng chỉ do đơn vị quản lý.
- `LAN_HOST`: IP nội bộ được cấp phép; giữ `127.0.0.1` nếu reverse proxy chạy ngay trên host. `LAN_PORT` mặc định `3000`.

```bash
chmod 600 .env
scripts/offline-load.sh /duong-dan-duoc-phep/han-ngu-bien-images.tar
docker compose config --quiet
docker compose up -d --no-build --pull never db
docker compose run --rm -T tools npm run db:migrate
```

Migration là bước vận hành rõ ràng, không chạy tự động khi app khởi động. Không chạy script seed phá dữ liệu upstream. Tạo admin bằng CLI, mật khẩu không xuất hiện trên command line:

```bash
read -rsp 'Mật khẩu admin mới: ' bootstrap_password
printf '\n'
printf '%s\n' "$bootstrap_password" | docker compose run --rm -T tools npm run auth:create -- admin admin 'Quản trị viên'
unset bootstrap_password
```

Dữ liệu mẫu là tùy chọn và chưa được kiểm duyệt:

```bash
docker compose run --rm -T tools npm run db:seed
docker compose up -d --no-build --pull never app ingress
docker compose ps
```

Kiểm tra app, DB và ingress healthy rồi dùng trình duyệt máy LAN vào origin đã cấu hình. Không đưa mật khẩu vào URL, screenshot hoặc log. Admin cấp tài khoản author/learner trong màn hình quản lý; không mở đăng ký công khai. Khi thử HTTP, dùng trình duyệt sạch và cấu hình demo cô lập; trước production phải bật cookie Secure và reverse proxy HTTPS/cert nội bộ được phê duyệt. Reverse proxy không được cấu hình với ACME Internet tự động trong mạng airgap.

## 3. Sao lưu DB và media

Backup có chứa hash mật khẩu, phiên và tiến độ; bảo vệ như dữ liệu người học, mã hóa/lưu giữ theo chính sách đơn vị. Đặt thư mục backup ngoài repository và ngoài image. Script yêu cầu cờ rõ ràng vì phải tạm dừng app để ảnh DB/media nhất quán; tự bật lại app nếu ban đầu đang chạy. PostgreSQL vẫn chạy.

```bash
scripts/docker-backup.sh /noi-luu-duoc-phep/backup-YYYYMMDD --stop-app
```

Gói gồm `database.dump` (pg_dump custom), `media.tar.gz`, `SHA256SUMS` và thời điểm UTC. Không dùng `docker compose down -v`; cờ `-v` sẽ xóa volume. Sao chép backup đến nơi được phép, kiểm checksum và chính sách lưu giữ.

## 4. Phục hồi thử trước, phục hồi thật sau phê duyệt

Lệnh restore **thay thế toàn bộ DB và media của compose project đang chọn**. Trước tiên dựng project thử riêng, dùng `.env` của DB giả, tên project/port riêng; không nối vào volume production. Luôn xác nhận đang chọn đúng project. Backup hiện trạng trước khi phục hồi production và chỉ chạy khi người quản lý đã phê duyệt. Script không tự khởi động app sau restore để có thời gian kiểm tra.

```bash
# Ví dụ môi trường thử có tên khác; cần .env chứa secret thử riêng.
export COMPOSE_PROJECT_NAME=han-ngu-bien-restore-test
export LAN_PORT=3001
docker compose up -d --no-build --pull never db
scripts/docker-restore.sh /noi-luu-duoc-phep/backup-YYYYMMDD --confirm-replace
docker compose up -d --no-build --pull never app ingress
```

Kiểm số khóa/bài/mục từ/tài khoản, đăng nhập, điểm/tiến độ và nội dung tệp media so với trước backup. Không chỉ kiểm lệnh `pg_restore` trả exit 0. Khi kết thúc kiểm thử, dừng đúng project thử và bỏ hai biến môi trường trên trước thao tác với project khác. Không xóa volume thật. Gói backup chỉ nhận từ nguồn tin cậy; không dùng tệp người học upload làm tar restore.

## 5. Nâng cấp, rollback và xoay secret

1. Ghi commit/version, image ID, cấu hình đang chạy; tạo backup DB+media và thử restore ở project giả.
2. Build/test bản mới ở máy có Internet được phép, xuất/nạp image mới bằng tag version khác; không ghi đè tag bản cũ.
3. Trong cửa sổ bảo trì, dừng app; chạy migration một lần bằng tools image **cùng version**; khởi động image mới với `--no-build --pull never`. Kiểm health, login, học/resume và nhập nội dung.
4. Rollback image chỉ đủ nếu migration tương thích ngược. Nếu schema không tương thích, cần phê duyệt và phục hồi DB+media từ backup tương ứng, chấp nhận ảnh hưởng dữ liệu phát sinh sau backup. Không tự chạy down migration phá dữ liệu.
5. Đổi `SESSION_PASSWORD` trong `.env` rồi recreate app/tools sẽ làm phiên hiện tại không còn hợp lệ; người học đăng nhập lại. Đổi mật khẩu DB cần thay trong PostgreSQL trước, cập nhật `.env`, recreate app; đổi biến `POSTGRES_PASSWORD` đơn thuần **không** đổi mật khẩu DB đã tồn tại trên volume. Không ghi secret vào log.

## 6. Kiểm tra offline có bằng chứng

Đây là quy trình kiểm tra; trạng thái đã chạy thực tế nằm trong `IMPLEMENTATION_STATUS.md`, không suy ra PASS chỉ từ cấu hình.

- Chạy `scripts/docker-offline-verify.sh` sau bootstrap để kiểm DB/ingress/app, app không có default IPv4 route và public TCP bị `ENETUNREACH`. Đây là kiểm mạng/readiness, không thay thế kiểm chức năng bên dưới.
- Ghi `docker version`, `docker compose version`, commit nguồn và image ID; xác nhận `docker compose config --quiet` thành công.
- Kiểm network runtime có `Internal=true`, DB không có port publish; app healthy, tất cả image có sẵn trước khi up. Khi kiểm không in toàn bộ `docker compose config` vì có thể lộ secret.
- Chặn/đo egress ở host hoặc dùng mạng nội bộ Docker đã cấu hình. Thử kết nối HTTPS công khai từ app/tools phải thất bại vì mất đường ra mạng, không chỉ vì thiếu CA.
- Trong điều kiện này: admin đăng nhập, cấp learner/author; author nhập CSV/XLSX 10 dòng → preview → lưu → admin xuất bản; learner học, trả lời, reload/logout/login và tiếp tục; upload/phát tệp audio hợp pháp, rồi nhập CSV lặp không nhân đôi.
- Mở DevTools Network hoặc ghi request bằng Playwright. Request phải chỉ tới origin LAN; không Google Fonts/CDN/Clerk/Neon/Stripe hoặc host công khai. Audio dùng tệp local đã kiểm định; không giả có giọng Trung chuẩn.
- Recreate app/DB không xóa volume, kiểm dữ liệu còn; backup/restore sang project thử và so sánh DB/media.
- Trên host airgap sạch, nạp archive+manifest+checksum rồi chạy `docker compose up --no-build --pull never`; nếu host vẫn cần registry/build/package download thì chưa đạt D02.

**Chưa được chứng nhận offline trong mạng LAN thật cho đến khi người vận hành chạy lại kịch bản này trên hạ tầng được phê duyệt.** Một lần test container trên cloud không chứng nhận toàn bộ bộ cài OS, máy khác kiến trúc CPU, thiết bị âm thanh hay chính sách mạng của đơn vị.
