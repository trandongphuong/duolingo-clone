# HTTPS cho máy chủ LAN

`compose.tls.yaml` bổ sung TLS trực tiếp tại nginx bằng chứng chỉ do người vận hành cung cấp. Không cần Internet, tài khoản cloud, ACME hoặc thay đổi ứng dụng. Máy Windows dùng Docker Linux containers và hướng dẫn [Windows local](WINDOWS_LOCAL.md); máy Linux dùng các lệnh Compose bên dưới.

## Điều kiện

- Docker Engine chạy Linux containers và **Docker Compose 2.24.4 trở lên**. Overlay dùng `!override` để thay hoàn toàn cổng HTTP, tránh giữ thêm một cổng không mã hóa khi ghép cấu hình.
- Tên miền hoặc IP LAN được phê duyệt; máy học viên phân giải được tên đó mà không cần DNS công khai.
- Chứng chỉ server PEM có SAN khớp tên miền/IP truy cập, còn hạn, được CA mà các máy học viên tin cậy cấp. File certificate chứa leaf trước, rồi các intermediate cần thiết. File private key PEM phải khớp certificate và không có passphrase tương tác vì nginx cần khởi động không giám sát.
- Private key nằm ngoài repository/gói image. Người vận hành giữ quyền đọc hạn chế bằng ACL/permission phù hợp hệ điều hành, đồng thời cho tiến trình nginx UID/GID `101:101` trong container đọc qua bind mount. Không mở key cho mọi người chỉ để vượt lỗi permission. Với Docker trên Windows, kiểm quyền truy cập của Docker vào thư mục và ACL trên host.
- Đây là cấu hình kỹ thuật, không thay thế phê duyệt tên miền, CA, firewall hoặc triển khai production của đơn vị.

## Cấu hình

Đặt trong file `.env` riêng, không commit; đường dẫn chứng chỉ là đường dẫn **trên máy chạy Docker Compose**, nên có thể dùng đường dẫn Windows tuyệt đối khi chạy PowerShell. Ví dụ tên/đường dẫn dưới đây chỉ là placeholder:

```dotenv
APP_ORIGIN=https://hanngubien.lan:8443
SESSION_SECURE=true
LAN_HOST=127.0.0.1
LAN_PORT=8443
TLS_CERT_FILE=/duong-dan-rieng/server-chain.pem
TLS_KEY_FILE=/duong-dan-rieng/server-key.pem
```

Giữ `127.0.0.1` khi kiểm tra trên chính máy chủ. Khi mở cho học viên trong LAN đã được cho phép, đặt `LAN_HOST` thành IP LAN được duyệt và mở đúng cổng này trong firewall. Tên trong `APP_ORIGIN`, SAN certificate, DNS/hosts của máy học viên và cổng phải khớp. Origin không có đường dẫn hoặc dấu `/` cuối.

Nếu `.env` cũ đang đặt `LAN_PORT=3000`, overlay vẫn dùng giá trị đó cho **HTTPS**, không tự đổi thành 8443. Sửa origin/port cùng nhau. Overlay ép `SESSION_SECURE=true` cho cả app và tools; dùng HTTP với overlay sẽ không đăng nhập được.

```bash
docker compose version --short
docker compose --env-file .env -f compose.yaml -f compose.tls.yaml config --quiet
# Sau khi đã nạp image, migrate và tạo admin theo LAN_DEPLOYMENT.md:
docker compose --env-file .env -f compose.yaml -f compose.tls.yaml up -d --no-build --pull never
docker compose --env-file .env -f compose.yaml -f compose.tls.yaml ps
```

Chứng chỉ/key không tồn tại sẽ bị từ chối; Compose không tự tạo directory tại đường dẫn nhầm. File được mount read-only vào nginx. Healthcheck dùng HTTP chỉ ở loopback trong container, chuyển tiếp đến trang đăng nhập thật của app; không công khai health port 8081. Cổng công khai duy nhất của overlay chuyển vào TLS 8443, app và PostgreSQL vẫn nằm trong mạng Docker nội bộ.

## Kiểm tra trước khi dùng

Kiểm nginx đọc được chứng chỉ và key trước khi đưa ingress lên:

```bash
docker compose --env-file .env -f compose.yaml -f compose.tls.yaml run --rm --no-deps ingress -t
```

Sau đó kiểm HTTPS từ máy học viên bằng trình duyệt tin cậy CA nội bộ. Khi dùng curl, cung cấp CA đúng, không bỏ qua xác thực TLS:

```bash
curl --fail --cacert /duong-dan/ca-noi-bo.pem https://hanngubien.lan:8443/sign-in
```

Trên Windows, lệnh `curl.exe` tránh nhầm alias PowerShell. Dùng Windows certificate store đã cài CA theo chính sách của đơn vị, hoặc `curl.exe --cacert` với CA PEM nếu phiên bản curl hỗ trợ. Không tiếp tục sử dụng production nếu trình duyệt báo sai tên miền/chain/hết hạn. Kiểm đăng nhập và cookie `Secure`, `HttpOnly`, `SameSite=Lax`, logout rồi dùng cookie cũ phải bị từ chối; học, upload/play media và import vẫn hoạt động trong điều kiện chặn Internet.

Khi kiểm thử dev có thể tạo CA/cert giả riêng dưới `work/`; đó chỉ là fixture để xác minh cấu hình TLS. Không phát hành hoặc tự đưa CA thử nghiệm vào trust store máy thật, không xem self-signed fixture là chứng chỉ production được phê duyệt.

## Gia hạn và thay chứng chỉ

Đặt file mới ở vị trí riêng, kiểm SAN/thời hạn/chain/key và quyền đọc. Cập nhật `TLS_CERT_FILE`/`TLS_KEY_FILE`, chạy `ingress -t`, rồi recreate **ingress** trong cửa sổ bảo trì:

```bash
docker compose --env-file .env -f compose.yaml -f compose.tls.yaml up -d --no-build --pull never --force-recreate ingress
```

Không xóa volume DB/media hoặc dùng `down -v`. Không thay secret phiên hay mật khẩu DB chỉ vì gia hạn certificate. Giữ file chứng chỉ cũ theo chính sách rollback; khôi phục đường dẫn cũ và recreate ingress nếu cần.

Trạng thái kiểm thử thực tế nằm trong `IMPLEMENTATION_STATUS.md` và báo cáo nghiệm thu. Việc tồn tại overlay không tự chứng nhận HTTPS đã được kiểm trên Windows hoặc mạng LAN thật.
