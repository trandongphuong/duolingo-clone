# Demo Render Free

Người dùng đã chọn Render Free cho demo Internet dùng dữ liệu giả. `render.yaml` cấu hình một web Docker và một PostgreSQL riêng, đều ghi rõ `plan: free`, cùng region Singapore. Database tên `hnb_demo`, PostgreSQL 17, chặn kết nối public bằng `ipAllowList: []`; web dùng connection string private do Render cấp. Auto-deploy từ code push được tắt.

**Trạng thái:** Render đã triển khai bản `86baddd` trong `Tony's workspace`, web và PostgreSQL đều Free. Deployment `dep-dbphbh0m7kps73auku9g` báo **Live**, log xác nhận seed/admin/bootstrap thành công. [Trang đăng nhập demo](https://hnb-demo-web-xpuz.onrender.com/sign-in); [web Dashboard](https://dashboard.render.com/web/srv-dbpha4on74is73dvam2g). Chủ tài khoản lấy giá trị secret `DEMO_ADMIN_PASSWORD` trong Environment của web để đăng nhập bằng `demo_admin`. Không có secret được đưa vào Git hoặc tài liệu.

Database Free hiện có hạn đến **10/12/2026**. Kiểm tra public-client/browser bị môi trường kiểm thử chặn và công cụ SQL không truy cập được DB private, nên các phần đó vẫn **NOT TESTED**; không mở public database để vượt giới hạn kiểm thử. Xem [bằng chứng hosting](verification/render-hosting.txt) và [giới hạn public QA](verification/render-public.txt).

## Mở trang tạo demo

Phần dưới dành cho instance mới. Không tạo trùng nếu đang dùng demo đã Live ở trên.

[Tạo demo trên Render Free từ nhánh demo](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Ftrandongphuong%2Fduolingo-clone%2Ftree%2Ffeat%2Fhan-ngu-bien-demo)

1. Đăng nhập/đăng ký Render và cấp quyền đọc repository nếu Render yêu cầu. Có thể thêm và kết nối tiện ích Render trong ChatGPT để trợ lý tiếp tục thao tác bằng tài khoản đã được cấp quyền.
2. Mở liên kết trên, kiểm tra nhánh `feat/han-ngu-bien-demo` và tệp `render.yaml`. Chỉ xác nhận khi trang tổng hợp hiển thị **Free** cho cả `hnb-demo-web` và `hnb-demo-db`, không có disk hay dịch vụ trả phí. Nếu tài khoản yêu cầu trả phí hoặc xác minh ngoài quyền đã cấp, dừng tại bước đó.
3. Render sinh ngẫu nhiên cả `DEMO_ADMIN_PASSWORD` và `SESSION_PASSWORD`; `DATABASE_URL` được nối tự động. Username mặc định là `demo_admin`. Chủ tài khoản xem mật khẩu ban đầu ở Environment của web service trong Dashboard và lưu riêng để đăng nhập; có thể đổi mật khẩu trong ứng dụng. Không gửi password/token vào Git hoặc log.
4. Render build Docker image và chạy `node render-start.mjs` tại `/app`. Startup lấy origin HTTPS thật từ `RENDER_EXTERNAL_URL`, chạy maintenance bootstrap (migration → seed → admin), rồi mới khởi động web. Free không cần pre-deploy hook, shell hoặc one-off job.
5. Khi deploy báo Live, lấy URL HTTPS **thực tế** từ trang web service, mở `/sign-in` và đăng nhập. Chỉ báo triển khai PASS sau khi kiểm tra URL đó. Không đoán subdomain từ tên service.

Blueprint dùng tên tài nguyên cố định. Trước khi tạo, bảo đảm workspace chưa có tài nguyên cùng tên cần giữ. Mỗi workspace chỉ có một Free Postgres; nếu đã có, dùng một workspace phù hợp khác hoặc xử lý với chủ tài khoản, không xóa database hiện hữu hoặc đổi sang gói trả phí tự động.

## Giới hạn ảnh hưởng đến demo

- Free web ngủ sau 15 phút không có request, lượt mở tiếp theo có thể mất khoảng một phút để khởi động.
- Free không có persistent disk. Media tải lên `/data/media` chỉ tồn tại tạm và mất khi service ngủ, restart hoặc deploy lại; metadata trong PostgreSQL có thể còn. Chỉ tải file giả lập có thể bỏ đi. Bản LAN dùng volume bền vững theo hướng dẫn riêng.
- Free Postgres có 1 GB storage và hết hạn sau 30 ngày. Sau khi hết hạn không truy cập được; Render có thể xóa database sau thời gian gia hạn. Đây là demo tạm, không phải nơi lưu dữ liệu cần giữ hoặc chứng minh backup/restore production.
- Hạn mức giờ chạy, băng thông và build dùng chung theo workspace. Nếu có phương thức thanh toán, một số phần vượt hạn mức có thể bị tính phí; kiểm tra mức dùng và spend limit của tài khoản trước khi triển khai. Không bật gói trả phí hoặc thêm tài nguyên ngoài Blueprint.

`DEMO_ADMIN_PASSWORD` cần còn trong secrets để startup có thể kiểm tra cấu hình khi Render đánh thức service. Bootstrap chạy lại không reset mật khẩu hoặc mở khóa/nâng quyền tài khoản hiện có. Có thể đổi mật khẩu đăng nhập trong ứng dụng; không coi việc sửa secret bootstrap là lệnh reset tài khoản.

## Kiểm chứng sau khi có quyền hosting

Kiểm tra Live/healthcheck, HTTPS và cookie Secure/HttpOnly/SameSite; đăng nhập/logout; học khóa mẫu và resume; tạo bài nháp/import CSV; upload/phát file giả. Restart web phải giữ tài khoản, điểm và nội dung trong PostgreSQL; media có thể mất theo giới hạn Free. Kiểm tra banner cảnh báo lưu trữ tạm. Chỉ dùng dữ liệu giả và giữ nhãn học liệu mẫu chưa thẩm định.

PASS hiện tại: Blueprint planning/approval, cấp tài nguyên Free, Docker build trên Render sau khi sửa COPY sang UID `1000:1000`, startup/seed/admin và trạng thái Live. NOT TESTED: trình duyệt/đăng nhập/E2E công khai, upload hoặc mất media trên hosting, cookie hosted thực tế và SQL trực tiếp vào DB private. Public-client bị proxy và công cụ web chặn; giữ nguyên kiểm soát mạng của database. Các giới hạn này không được tính thành ứng dụng FAIL hoặc nghiệm thu hoàn tất.

## Tài liệu chính thức đã đối chiếu

- [Blueprint fields và tham chiếu database/secrets](https://render.com/docs/blueprint-spec).
- [Liên kết Deploy to Render, chọn nhánh và tắt auto-deploy](https://render.com/docs/deploy-to-render).
- [Biến môi trường mặc định, gồm RENDER_EXTERNAL_URL](https://render.com/docs/environment-variables).
- [Giới hạn của Free web/Postgres và quy tắc vượt hạn mức](https://render.com/docs/free).

Xem thêm [bootstrap demo](DEMO_DEPLOYMENT.md) và [bản cài LAN](LAN_DEPLOYMENT.md).
