# Quyết định kỹ thuật

- Giữ modular monolith Next.js 16, React 19, React Admin, Drizzle và PostgreSQL. Dùng pg pool thay Neon HTTP; không thêm microservice.
- Tài khoản do admin cấp; không signup công khai. Mật khẩu bcrypt, session cookie bảo vệ bằng thư viện được bảo trì và đối chiếu phiên DB để có thể thu hồi. Phân quyền learner/author/admin ở server.
- Loại bỏ dịch vụ cloud khỏi dependency/runtime; dùng tài nguyên local và CSP cùng origin. Production LAN cần HTTPS/chứng chỉ do người vận hành cấp; HTTP chỉ demo cô lập.
- Giữ bảng Lingo và thêm cột/bảng bằng migration versioned. Không chạy seed upstream phá dữ liệu. Bài đã publish bất biến; phiên bản mới dùng bản ghi bài mới, giữ attempt/progress cũ.
- Chấm điểm phía server trong transaction, unique progress ngăn cộng điểm lặp. Đáp án đúng không nằm trong payload trước trả lời.
- Bộ dữ liệu là mẫu công khai chưa kiểm duyệt, không thay IMO SMCP tiếng Anh. Không tạo âm thanh Trung bằng dịch vụ online.

- React Admin nâng cao chỉ đọc; các API ghi cũ trả409 sau auth/CSRF. Toàn bộ soạn/sửa/duyệt đi qua content service có khóa bài/phiên bản, tránh đường CRUD cũ làm thay đổi lịch sử hoặc đua với publish.
- Cho phép học lại/chọn bài đã xuất bản; không khóa trả phí hay ép lộ trình tuần tự. Server vẫn kiểm quyền và trạng thái xuất bản.
