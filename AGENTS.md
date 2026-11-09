# AGENTS.md — Hán ngữ biển 1.0

Đọc `SPEC_CHI_TIET.md` và `NGHIEM_THU.md` trước khi chỉnh sửa. Mọi tác vụ phát triển tại repository này phải tuân thủ những quy tắc sau.

## Mục tiêu cố định

Biến Lingo (`sanidhyy/duolingo-clone`) thành nền tảng **học tiếng Trung giản thể + Pinyin, giao diện tiếng Việt, chạy độc lập LAN tại runtime**, tạo khóa học bằng bảng kiểu Memrise và Excel/CSV, không phụ thuộc Internet/API ngoài trong quá trình vận hành.

## Quyền tự chủ

1. Chủ động nghiên cứu repository, đề xuất và triển khai phương án **ít xâm lấn, an toàn, dễ bảo trì nhất**. Không hỏi chủ dự án về tên biến, thư viện nhỏ, màu nút, cách đặt tệp, phương án triển khai chi tiết nếu có lựa chọn kỹ thuật hợp lý.
2. Không chỉ lập kế hoạch rồi dừng. Tiếp tục qua các chặng, tạo mã, chạy lệnh, sửa lỗi và kiểm thử cho đến khi đạt tiêu chí nghiệm thu hoặc gặp trở ngại thực sự không thể vượt qua trong quyền hạn hiện có.
3. Bảo tồn các khả năng hữu ích của Lingo (courses, units, lessons, challenges, tiến độ, điểm). Tái sử dụng Next.js/React/React Admin/Drizzle/PostgreSQL; tránh rewrite hoặc microservices không cần thiết.
4. Dùng nhánh riêng, commit nhỏ, message mô tả rõ. Không force-push nhánh chính, không tự merge, không tự deploy production, không tự đẩy code/nội dung lên dịch vụ công cộng khác.
5. Ghi nhật ký `IMPLEMENTATION_STATUS.md` sau mỗi chặng: đã làm, kiểm thử thực tế, lệnh đã chạy, còn thiếu, rủi ro và quyết định kỹ thuật. Không đánh dấu PASS khi chưa chạy được kiểm thử.

## Chỉ xin ý kiến khi

- Cần chi tiền/đăng ký dịch vụ trả phí hoặc cấp quyền truy cập mới.
- Cần thông tin nội bộ, bí mật, dữ liệu cá nhân thật, hoặc xác định nội dung nghiệp vụ/đối ngoại chưa được phê duyệt.
- Sắp xóa/sửa dữ liệu thật, thay đổi hạ tầng production, thay đổi định hướng sản phẩm/phạm vi hoặc đưa ra quyết định pháp lý/giấy phép trọng yếu.
- Mắc kẹt do thiếu quyền truy cập, bí mật hoặc hạn chế môi trường mà không có phương án hợp lệ để tự xử lý.

Trong trường hợp đó, đưa ra **một câu hỏi ngắn, một đề xuất mặc định và tác động nếu chọn**, tiếp tục những phần không bị chặn. Mọi chuyện nhỏ tự quyết và ghi lại.

## An ninh & tính đúng đắn

- Không dùng thông tin quân sự không công khai, tọa độ tác nghiệp, cấu trúc tổ chức thật, tài liệu hạn chế hoặc tài khoản người dùng thật làm dữ liệu mẫu.
- Không sử dụng Clerk/Stripe/Neon, CDN, Google Fonts từ mạng, analytics/telemetry hay API ngoài ở runtime. Gỡ phụ thuộc dịch vụ chứ không chỉ ẩn nút UI.
- Không tự triển khai server công cộng, không đặt cổng preview ở chế độ public nếu không cần. Không commit secrets/`.env`, DB dumps, key hay dữ liệu người học.
- Dùng thư viện xác thực đáng tin cậy; hash mật khẩu an toàn, session httpOnly/SameSite/Secure ở production; kiểm soát truy cập ở **server** cho mỗi API. Không tin thuộc tính `correct` gửi từ frontend.
- Dữ liệu người học không bị xóa khi cập nhật nội dung. Không chạy `pnpm run db:prod` của upstream trên dữ liệu cần giữ (script `scripts/prod.ts` có xóa bản ghi trước khi seed).
- Bản khóa học tiếng Trung liên quan an toàn/đối ngoại chỉ dùng ngữ liệu công khai và được gắn nhãn bản mẫu chưa phê duyệt. Không thể hiện tiếng Trung là sự thay thế IMO SMCP tiếng Anh trong thông tin an toàn hàng hải quốc tế.
- Tôn trọng giấy phép nguồn mở, lưu thông báo bản quyền; không sao chép logo, mascot hoặc hình ảnh của Duolingo/Memrise nếu không có quyền.

## Tiêu chuẩn kỹ thuật

- Có migration versioned, seed idempotent không phá dữ liệu, bản xuất/nhập Excel có preview + validate + báo lỗi dòng; API type-safe, kiểm thử tự động và README chạy offline.
- Ưu tiên tài liệu trong repository và lệnh thực tế hơn suy đoán. Sau mỗi sửa đổi chạy ít nhất lint/typecheck/test/build phù hợp; thực hiện E2E, kiểm tra quyền truy cập và thử nghiệm offline khi môi trường cho phép.
- Khi không thể kiểm tra thực tế LAN không Internet, phải báo rõ **chưa được chứng nhận offline trong mạng thật**; cung cấp quy trình người vận hành kiểm tra.
- Không tự động gọi dịch vụ tạo nội dung/giọng nói online với dữ liệu của dự án. Phát âm tiếng Trung phải được thẩm định; không giả vờ có âm thanh chuẩn nếu chưa có.
