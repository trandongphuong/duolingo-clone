# CHECKLIST NGHIỆM THU — HÁN NGỮ BIỂN 1.0

Dùng kết quả `PASS` / `FAIL` / `NOT TESTED` cho **mỗi** điều kiện; kèm lệnh hoặc bằng chứng. Trên cloud có thể chỉ đạt điều kiện phát triển; môi trường LAN thật cần phê duyệt và kiểm thử bổ sung. Không tự chứng nhận an toàn thông tin quân sự.

| ID | Mức | Trường hợp | Điều kiện PASS | Minh chứng cần ghi |
|---|---|---|---|---|
| A01 | Critical | Build | Dependency install, lint, typecheck, unit test, production build thành công | Phiên bản môi trường + lệnh + exit status |
| A02 | Critical | Auth local | Đăng nhập, đăng xuất bằng tài khoản DB; không yêu cầu Clerk | E2E/log network |
| A03 | Critical | Role | Guest/learner không vào admin, API admin trả 401/403; author không publish khi chưa có quyền | Test API server |
| A04 | Critical | PostgreSQL | DB là server PostgreSQL riêng trong compose, không Neon; không publish DB port bên ngoài | Compose + test kết nối |
| A05 | Critical | Thanh toán | Không còn Stripe/subscription bắt buộc/gọi checkout; học không bị paywall | Audit + browser flow |
| A06 | Critical | Offline runtime | Chặn egress Internet; tài khoản, khóa học, quiz, tiến độ, admin nhập CSV vẫn hoạt động | Test mô phỏng egress deny; network audit |
| A07 | Critical | Không xóa dữ liệu | Re-run seed/migrate không xóa khóa đã tạo hay tiến độ user | Integration test trước/sau |
| A08 | Critical | Server grading | Không gửi `correct` trước khi trả lời; server tự kiểm chứng, không thể tự tăng điểm bằng request giả hoặc double click | Unit/API regression |
| B01 | Critical | Wizard tác giả | Trong một luồng, tạo khóa/chủ đề/bài và dán ít nhất 10 dòng từ, preview, lưu | E2E hoặc video/screenshot |
| B02 | Critical | Import CSV/XLSX | Nhập 10 dòng thật, báo lỗi dòng hỏng, xác nhận và lưu transaction | Unit parser + E2E |
| B03 | Critical | Import lặp | Nhập lại không tạo trùng challenge/option; xử lý cập nhật bản nháp | Integration test |
| B04 | Critical | Câu hỏi tự sinh | Chọn nghĩa và chọn Hanzi có đáp án đúng, phương án nhiễu hợp lệ, server chấm đúng | Unit + E2E |
| B05 | High | Media cục bộ | Upload/serve một tệp âm thanh hợp pháp; trình duyệt phát trong offline; file sai loại bị từ chối | E2E + security test |
| B06 | High | Trạng thái nội dung | Author nháp, admin duyệt/xuất bản; learner chỉ thấy được phần cho phép | E2E role |
| B07 | Critical | Lưu tiến độ | Đúng điểm, bài hoàn thành, refresh/log-out/log-in vẫn tiếp tục được | E2E persistent DB |
| B08 | High | Version an toàn | Sửa nội dung đã xuất bản không xóa/sai lịch sử học viên | Integration test |
| C01 | High | Nội dung mẫu | 10 bài và khoảng 100 mục, đúng định dạng Hanzi/Pinyin/VI, banner mẫu chưa kiểm duyệt | Seed counts + review UI |
| C02 | High | Responsive | Không tràn màn hình 360/390/768/1440px, chức năng học/admin cơ bản dùng được | Screenshot/Playwright |
| C03 | Medium | Ôn tập | Có danh sách cần ôn và lịch nhắc đơn giản; cập nhật khi đúng/sai | Test business logic |
| C04 | High | A11y cơ bản | Form có labels, keyboard focus, ảnh có alt, nội dung audio có text tương đương | Accessibility scan/manual |
| D01 | Critical | Docker Compose | Clean env với images sẵn có lên app + DB, volume, health check | Lệnh + output |
| D02 | Critical | Airgap transfer | Xuất/import image offline với checksum; không yêu cầu pull ở runtime | Test hoặc NOT TESTED rõ ràng |
| D03 | Critical | Backup/Restore | Sao lưu và phục hồi thử DB + media không mất nội dung | Bằng chứng restore |
| D04 | High | Secrets | Không commit `.env`/password; có `.env.example`; bootstrap admin an toàn | Git scan + docs |
| D05 | High | License & supply chain | Lưu giấy phép MIT/upstream; danh mục deps, asset license, scan lỗ hổng có thể làm | Files + report |
| D06 | Critical | Không cloud production | Không deploy tự động lên cloud công khai/đơn vị thật, preview ở trạng thái riêng tư nếu có | Config + trạng thái |
| D07 | High | Tài liệu | README tiếng Việt nêu cài, vận hành, khôi phục, kiểm tra offline và giới hạn đã biết | File inspection |

## Kịch bản nghiệm thu end-to-end người dùng

1. Admin bootstrap lần đầu và đăng nhập; tạo học viên và author demo (mật khẩu cấu hình, không có default hardcoded).
2. Author tạo khóa `Hán ngữ cơ bản` → Unit `Chào hỏi` → Lesson `Bài 1`.
3. Dán 10 mục từ (chữ Hán giản thể/Pinyin/VI), xem preview, sửa một dòng hỏng, lưu, xuất thử XLSX hoặc CSV.
4. Author gửi duyệt; admin xem và xuất bản; learner chỉ thấy khóa đã xuất bản.
5. Learner học 5 thẻ, trả lời trắc nghiệm chọn nghĩa/chọn Hanzi; một câu sai; xem kết quả; đăng xuất và đăng nhập lại, tiến độ khớp.
6. Author sửa draft và import lại, không làm mất lịch sử learner.
7. Upload tệp âm thanh mẫu đã được quyền sử dụng, phát dưới điều kiện không có Internet.
8. Recreate containers mà không xóa volumes → tiến độ/khóa tồn tại; backup/restore trên instance test mới.
9. Với toàn bộ dịch vụ bên ngoài bị chặn, chạy lại đường học và admin import. Nếu không làm được trong Codex Cloud, đánh dấu NOT TESTED, đưa script để kỹ thuật viên đơn vị xác minh sau.

## Format báo cáo cuối

```
MỐC/COMMIT:
BẢN APP/ENV:
TEST PASS: ...
TEST FAIL: ...
NOT TESTED: ...
ĐƯỜNG DẪN CODE/PR:
HƯỚNG DẪN XEM THỬ:
RỦI RO CÒN LẠI:
VIỆC CẦN NGƯỜI QUẢN LÝ PHÊ DUYỆT:
```

**Không ghi “đạt tiêu chuẩn triển khai trong toàn quân” chỉ dựa trên MVP/kiểm thử cloud.**
