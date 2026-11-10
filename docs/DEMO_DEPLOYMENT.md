# Demo Internet dùng dữ liệu giả lập

Người dùng đã cho phép triển khai một bản demo có đăng nhập để xem sản phẩm trực tiếp. Bản demo chạy ứng dụng Next.js/Node.js thật cùng PostgreSQL; dữ liệu mẫu chưa được thẩm định phải giữ nhãn cảnh báo. Bản vận hành LAN và các lệnh LAN hiện có tiếp tục hoạt động độc lập.

## Trạng thái và điều kiện triển khai

Chưa có URL demo công khai được xác minh. Kết nối tài khoản hosting Railway đang chờ hoàn tất; chưa tạo dịch vụ, cơ sở dữ liệu hoặc khoản phí. Trước khi tạo tài nguyên phải kiểm tra quyền và chi phí thực tế của tài khoản. Không tự đăng ký gói trả phí hoặc cấp quyền mới. Có thể dùng nhà cung cấp khác nếu đáp ứng cùng kiến trúc và được cấp quyền phù hợp.

Môi trường chạy cần:

- Node.js 24, image Docker của repository, một tiến trình web chạy bản build production.
- Một PostgreSQL mới, riêng cho demo, ban đầu không có bảng trong schema `public`; tên cơ sở dữ liệu chứa `demo`, ví dụ `hnb_demo`. Không trỏ đến dữ liệu LAN, dữ liệu nghiệp vụ hoặc cơ sở dữ liệu dùng chung.
- Một volume media riêng, bền vững, mount tại `/data/media` và `MEDIA_DIR=/data/media`. Xác nhận quyền ghi của tiến trình web trước khi mở dịch vụ.
- Reverse proxy HTTPS, origin công khai cố định và health check HTTP `/sign-in`. Không công khai cổng PostgreSQL.

Không dùng Sites/Cloudflare Worker để thay thế runtime Node + PostgreSQL hiện tại. URL preview nội bộ của công cụ QA không phải URL demo dành cho người dùng.

## Biến môi trường

Đặt bí mật trong phần quản lý secrets của hosting; không commit chúng vào Git, không thêm vào image, build args hoặc log. Dùng mật khẩu ngẫu nhiên riêng cho demo. Không có mật khẩu quản trị mặc định.

| Biến | Giá trị/yêu cầu |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | Chính xác `true` để cho phép bootstrap |
| `DEMO_DATA_POLICY` | Chính xác `SYNTHETIC_ONLY` |
| `DATABASE_URL` | URL `postgresql://` hoặc `postgres://` của PostgreSQL demo; tên database chứa `demo`; không có query `database`/`dbname` ghi đè tên |
| `SESSION_PASSWORD` | Bí mật ngẫu nhiên ít nhất 32 ký tự |
| `SESSION_SECURE` | `true` cho cookie HTTPS |
| `APP_ORIGIN` | Origin HTTPS thực của dịch vụ, không có `/` cuối, path, query, fragment hoặc thông tin đăng nhập |
| `DEMO_ADMIN_USERNAME` | Tùy chọn, mặc định `demo_admin`; 3–64 ký tự chữ Latin thường, số, `.`, `_`, `-` |
| `DEMO_ADMIN_PASSWORD` | Bí mật ngẫu nhiên ít nhất 12 ký tự và tối đa 72 byte UTF-8; chỉ cấp qua environment cho bootstrap |
| `MEDIA_DIR` | `/data/media`, khớp volume riêng |
| `PORT` | Cổng do hosting cấp; tiến trình web phải lắng nghe trên `0.0.0.0` |

Các giá trị `SESSION_PASSWORD`, `DATABASE_URL` và `APP_ORIGIN` dùng cho bootstrap phải khớp tiến trình web. Sau bootstrap có thể gỡ `DEMO_ADMIN_PASSWORD` khỏi environment của dịch vụ web; không thay đổi mật khẩu hiện có khi chạy bootstrap lại. Không đưa secrets vào lệnh shell dưới dạng literal hoặc ảnh chụp màn hình.

## Bootstrap một lần, có thể chạy lại an toàn

Chỉ chạy sau khi đã cấp PostgreSQL demo mới và đặt đúng environment. Làm việc tại thư mục gốc ứng dụng; bootstrap từ chối runtime ngoài Node.js 24.

Từ source đã cài dependency:

```sh
node --import tsx scripts/demo-bootstrap.ts
```

Trong image đã đóng gói entry bootstrap và các maintenance bundle:

```sh
node maintenance/demo-bootstrap.cjs
```

Bootstrap xác thực toàn bộ cấu hình trước khi kết nối. Nó từ chối database có sẵn bảng nhưng chưa có marker demo. Với database rỗng, nó ghi marker `public.hnb_demo_bootstrap` với chính sách `SYNTHETIC_ONLY`; marker cho phép chạy lại nếu lần trước bị gián đoạn. Đây là hàng rào chống chọn nhầm database, không phải công cụ phát hiện dữ liệu nhạy cảm. Người vận hành vẫn phải đảm bảo mọi dữ liệu nhập vào chỉ là giả lập.

Tiếp theo, bootstrap chạy migration hiện có, rồi seed hiện có theo thứ tự, bằng child process. Có bundle `maintenance/migrate.cjs` và `maintenance/seed.cjs` thì dùng bundle; nếu không, dùng `scripts/migrate.ts` và `scripts/seed.ts` từ `process.cwd()`. Không dựa vào đường dẫn build của máy khác. Output child process được giữ kín để lỗi PostgreSQL không lộ URL hoặc credentials.

Cuối cùng, một transaction với advisory lock tạo đúng một admin theo username đã chuẩn hóa. Nếu đã có admin đang hoạt động cùng tên, giữ nguyên tài khoản và mật khẩu. Nếu tên thuộc learner/author hoặc tài khoản bị khóa, dừng với lỗi; không nâng quyền, mở khóa hoặc reset mật khẩu. Mật khẩu mới được hash bằng bcrypt cost 12 theo cơ chế đăng nhập hiện có. Không in password, hash hoặc session secret.

Migration/seed dùng cơ chế idempotent hiện có; không xóa dữ liệu hoặc reset cơ sở dữ liệu. Thất bại trả exit code khác 0. Marker và migration thành công được giữ lại để chẩn đoán và chạy lại; không tự rollback bằng cách xóa database. Chỉ mở traffic sau khi bootstrap thành công và kiểm tra đăng nhập.

## Trình tự mở demo và xác minh

1. Hoàn tất kết nối hosting được cấp quyền; xem cấu hình tài khoản, quyền tạo tài nguyên và chi phí trước khi tạo dịch vụ.
2. Cấp PostgreSQL demo riêng và volume media riêng. Đặt tên database có `demo` ngay khi cấp mới; không đổi tên hoặc tái sử dụng database có dữ liệu thật.
3. Build/deploy image từ nhánh demo; đặt environment và HTTPS origin thực của dịch vụ.
4. Chạy bootstrap một lần từ source hoặc image có maintenance bundle. Nếu dùng pre-deploy hook, nó chỉ cần kết nối PostgreSQL và không đọc/ghi media; một số hosting, gồm Railway, không mount volume vào hook và không giữ thay đổi filesystem của hook.
5. Khởi động web với volume đã mount, kiểm tra `/sign-in`, đăng nhập admin, mở khóa mẫu, học một thẻ, kiểm tra tiến độ, tạo khóa nháp và lưu media giả lập. Khởi động lại dịch vụ và xác nhận database/media còn nguyên.
6. Kiểm tra cookie có cờ Secure/HttpOnly/SameSite, route quản trị yêu cầu đăng nhập, không có secrets trong log, dữ liệu mẫu vẫn có nhãn chưa thẩm định. Chạy lại bootstrap và xác nhận tài khoản/mật khẩu, dữ liệu và tiến độ không bị reset.
7. Chỉ gửi URL HTTPS thật đã mở được qua trình duyệt cho người dùng, kèm cách nhận tài khoản qua kênh phù hợp. Không công bố credential trên repository hoặc tài liệu này.

Chỉ báo PASS khi có bằng chứng chạy thực tế. Trước khi kết nối hosting, provisioning, HTTPS và kiểm tra end-to-end trên URL công khai đều là NOT TESTED. Không xem việc chuẩn bị script này là đã triển khai xong.
