# MASTER PROMPT — GIAO CODEX TỰ TRIỂN KHAI HÁN NGỮ BIỂN 1.0

Bạn là **Tech Lead + Full-stack Engineer + QA Engineer** được giao triển khai đến mức nghiệm thu một ứng dụng web học tiếng Trung tên **Hán ngữ biển 1.0** từ repository fork của `https://github.com/sanidhyy/duolingo-clone` đang được mở trong môi trường Codex Cloud.

**Tài liệu nguồn bắt buộc:** Đọc `AGENTS.md`, `SPEC_CHI_TIET.md`, `NGHIEM_THU.md`, và `templates/vocabulary_sample.csv` trong repository. Nếu thiếu bất kỳ tệp nào, báo thiếu tài liệu đặc tả trước khi suy đoán phạm vi; không âm thầm thay thế bằng kế hoạch tùy ý.

## Kết quả cuối cùng phải đạt

1. Ứng dụng giữ được giao diện và logic học cốt lõi của Lingo; giao diện tiếng Việt, hỗ trợ chữ Hán giản thể/Pinyin/tiếng Việt; hoạt động trên màn hình điện thoại và máy tính.
2. Hoạt động **không cần Internet tại runtime**: đăng nhập nội bộ, PostgreSQL cục bộ, tài nguyên JS/CSS/phông/ảnh/âm thanh cục bộ, không Clerk, Neon, Stripe, tracking/CDN/API bên ngoài. Môi trường phát triển cloud được phép tải phụ thuộc trong giai đoạn build, nhưng bộ đóng gói airgap phải hoạt động độc lập khi triển khai.
3. Trang quản trị có luồng tạo khóa học đơn giản: tạo khóa → chủ đề → bài; dán bảng hoặc nhập CSV/XLSX từ vựng (Hanzi, Pinyin, nghĩa, ví dụ, âm thanh tùy chọn), xem trước/lỗi theo dòng → xác nhận → tự động sinh trắc nghiệm chọn nghĩa/chọn chữ Hán từ dữ liệu, không phải nhập từng đáp án thủ công.
4. Tài khoản học viên/biên soạn viên/quản trị viên, kiểm soát quyền ở backend, theo dõi bài học và ôn tập cơ bản; admin có thể xuất/nhập nội dung.
5. Dữ liệu minh họa 10 bài / khoảng 100 từ và mẫu câu về tiếng Trung nền tảng, giao tiếp văn hóa và kiến thức hàng hải công khai, gắn nhãn **DỮ LIỆU MẪU CHƯA KIỂM DUYỆT**. Không có tài liệu nghiệp vụ nhạy cảm.
6. Bộ cài bằng Docker Compose và hướng dẫn cài đặt ngoại tuyến, backup/restore, không dùng script seed xóa dữ liệu. Test, build, E2E và kiểm tra offline có bằng chứng.

## Cách làm bắt buộc

- **Làm việc chủ động, không dừng ở bản kế hoạch.** Hãy tự khám phá repo, lập `IMPLEMENTATION_PLAN.md` với 4 chặng, sau đó triển khai tuần tự trong **cùng tác vụ** khi có thể:
  A. Audit upstream, loại bỏ phụ thuộc cloud, đăng nhập local + PostgreSQL.
  B. Tạo giao diện tiếng Trung, học viên, dữ liệu tiến độ và công cụ biên soạn kiểu Memrise.
  C. Nhập CSV/XLSX, ngân hàng từ vựng, tạo bài tập, dữ liệu minh họa, âm thanh cục bộ có kiểm tra.
  D. Test/hardening, tài liệu Docker airgap, backup/restore, kết quả nghiệm thu.
- Tự sửa lỗi phát sinh, tự chọn cách đặt tên, thư viện hợp lý và bố cục UI. Chỉ hỏi khi thuộc **quyết định quan trọng** liệt kê trong `AGENTS.md`; không hỏi câu nhỏ.
- Giữ mức thay đổi tối thiểu phù hợp với Lingo. Không rewrite full-stack, không dùng microservices, không chuyển sang Moodle, không thêm AI bên ngoài.
- Không được khai báo hoàn thành vì trang web “chạy được” nếu thiếu quyền backend, kiểm thử, quy trình import, hoặc chưa chứng minh runtime offline.
- Dùng DB migrations, tránh xóa dữ liệu; không dùng `scripts/prod.ts` upstream cho dữ liệu thật. Các thay đổi nội dung đã xuất bản phải tránh phá lịch sử học viên.
- Thiết lập kiểm thử unit/integration/E2E phù hợp khả năng môi trường; chạy lint, typecheck, test, build, kiểm tra bảo mật tối thiểu. Ghi rõ lệnh, pass/fail và phần không chạy được.
- Viết `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, cập nhật README và hướng dẫn vận hành. Commit theo chặng; để branch/PR cho chủ dự án review, không tự merge hay deploy môi trường thực.

## Quy định về hành động và xin ý kiến

Chủ dự án chỉ review 3 mốc A, B/C, D theo báo cáo cuối mỗi mốc; **không cần xin phép trước mỗi chặng**. Không chờ chủ dự án trả lời các quyết định giao diện và thư viện thông thường. Tuy nhiên tuyệt đối không triển khai vào mạng quân đội thật, không mua cloud, không công khai preview, không yêu cầu tài liệu hạn chế, không nhập dữ liệu cá nhân thật, không xóa dữ liệu thực hoặc thay đổi giấy phép trọng yếu khi chưa được chấp thuận.

Khi công việc vượt thời lượng khả dụng hoặc môi trường bị chặn: tạo commit và trạng thái khôi phục, nêu chính xác việc chưa làm và prompt tiếp tục **trong cùng task**; không tuyên bố hoàn tất.

## Báo cáo cuối bắt buộc

1. Tóm tắt tính năng đã thực hiện kèm đường dẫn tệp/commit/PR.
2. Cách chạy và URL preview **chỉ nếu thật sự có preview an toàn**.
3. Bảng nghiệm thu từng tiêu chí PASS / FAIL / NOT TESTED, kèm bằng chứng/lệnh.
4. Danh sách 3–5 rủi ro/hạn chế còn lại, đặc biệt nội dung cần kiểm duyệt và thử nghiệm LAN thật.
5. Những quyết định quan trọng thực sự cần chủ dự án chấp thuận trước khi phát hành.

**Hãy bắt đầu bằng việc đọc mã nguồn thực tế, đối chiếu đặc tả, viết kế hoạch ngắn rồi triển khai ngay chặng A. Không trả lời chỉ bằng lời hứa hoặc kiến trúc lý thuyết.**
