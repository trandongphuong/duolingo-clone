# Quyết định kỹ thuật

- Giữ modular monolith Next.js 16, React 19, React Admin, Drizzle và PostgreSQL. Dùng pg pool thay Neon HTTP; không thêm microservice.
- Tài khoản do admin cấp; không signup công khai. Mật khẩu bcrypt, session cookie bảo vệ bằng thư viện được bảo trì và đối chiếu phiên DB để có thể thu hồi. Phân quyền learner/author/admin ở server.
- Loại bỏ dịch vụ cloud khỏi dependency/runtime; dùng tài nguyên local và CSP cùng origin. Production LAN cần HTTPS/chứng chỉ do người vận hành cấp; HTTP chỉ demo cô lập.
- Giữ bảng Lingo và thêm cột/bảng bằng migration versioned. Không chạy seed upstream phá dữ liệu. Bài đã publish bất biến; phiên bản mới dùng bản ghi bài mới, giữ attempt/progress cũ.
- Chấm điểm phía server trong transaction, unique progress ngăn cộng điểm lặp. Đáp án đúng không nằm trong payload trước trả lời.
- Bộ dữ liệu là mẫu công khai chưa kiểm duyệt, không thay IMO SMCP tiếng Anh. Không tạo âm thanh Trung bằng dịch vụ online.

- React Admin nâng cao chỉ đọc; các API ghi cũ trả409 sau auth/CSRF. Toàn bộ soạn/sửa/duyệt đi qua content service có khóa bài/phiên bản, tránh đường CRUD cũ làm thay đổi lịch sử hoặc đua với publish.
- Cho phép học lại/chọn bài đã xuất bản; không khóa trả phí hay ép lộ trình tuần tự. Server vẫn kiểm quyền và trạng thái xuất bản.

- Người dùng đã cho phép triển khai demo Internet có đăng nhập và chỉ dùng dữ liệu giả. Tách thay đổi tại `feat/han-ngu-bien-demo` từ checkpoint LAN `96a4d5e`; database và volume media của demo phải được cấp riêng. Đây là ngoại lệ được người dùng cho phép đối với giới hạn triển khai công khai trong tài liệu gốc, dành riêng cho demo.
- Chọn kiến trúc hosting Docker/Node 24 + PostgreSQL để dùng ứng dụng thật. Người dùng chọn Render Free sau khi được thông tin giới hạn: database hết hạn 30 ngày, media tạm mất khi ngủ/restart/deploy. Demo có thông báo lưu trữ tạm tại đăng nhập và màn hình chính. Bản LAN dùng volume bền vững; runtime ứng dụng tiếp tục dùng tài nguyên cùng origin và pg thông thường.
- Bootstrap demo là lệnh tường minh; entry point Render chọn chạy lệnh này trước web, còn quy trình LAN dùng CLI riêng. Yêu cầu HTTPS, cookie Secure, secrets từ environment và database riêng có tên chứa `demo`. Database có bảng nhưng chưa có marker demo bị từ chối trước migration/seed; chạy lại giữ nguyên mật khẩu, quyền và trạng thái tài khoản hiện có.
- Render Free không có pre-deploy command/shell/one-off job: chọn entry point riêng `render-start.mjs` cho Render, chạy bootstrap có guard trước khi web lắng nghe. Lệnh khởi động LAN giữ cơ chế bootstrap CLI hiện có. Origin lấy từ biến HTTPS của Render, parent chuyển tín hiệu dừng tới child đang chạy, secret admin khởi tạo chỉ cấp cho bootstrap. Blueprint ghi rõ Free cho cả hai tài nguyên, DB private, tắt auto-deploy và không yêu cầu disk trả phí.

- Máy đích được người dùng xác nhận là Windows 10/11. Bổ sung PowerShell tương thích5.1 và Linux containers đã được quản trị viên chuẩn bị; bộ cài không tự cài engine, chấp nhận giấy phép hoặc mở firewall. Docker Desktop có điều kiện giấy phép riêng cho cơ quan nhà nước; có thể dùng Docker Engine trên máy Linux/WSL2 được quản trị, không coi Desktop là thành phần miễn phí bắt buộc.
- Bộ bàn giao được ghi nhãn RC khi chưa có Windows/airgap độc lập để kiểm chứng. ZIP offline dùng allowlist, checksum và imageIDs/provenance; credentials, database, media người dùng và chứng chỉ/key không được đưa vào gói.
- Actor ghi nội dung/media giữ shared row lock đến khi commit; thao tác khóa/đổi role cần exclusive row lock. Thứ tự khóa actor trước lesson/family giúp xử lý request đang chạy và tránh đảo thứ tự khóa với quản trị tài khoản.
