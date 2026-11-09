# ĐẶC TẢ SẢN PHẨM VÀ KỸ THUẬT — HÁN NGỮ BIỂN 1.0

Phiên bản tài liệu: 1.0 (2026-11-09)
Chủ dự án: người quản lý nội dung và nghiệm thu sản phẩm
Đội thực thi: Codex Cloud trên fork của `sanidhyy/duolingo-clone`
Trạng thái: **yêu cầu phát triển, không phải cam kết tính năng đã có**

---

## 1. Tầm nhìn, phạm vi và nguyên tắc

### 1.1 Mục tiêu
Xây dựng ứng dụng web học **tiếng Trung phổ thông (Mandarin, chữ Hán giản thể)** cho nhu cầu giao tiếp nền tảng, đối ngoại văn hóa và giao tiếp dân sự/an toàn hàng hải. Mục tiêu trước mắt là một MVP có thể trình diễn, cho phép quản trị nội dung bởi người không biết lập trình, và có bộ cài hoạt động trong **mạng LAN không có Internet**.

Tái sử dụng Lingo (Next.js, React, React Admin, Drizzle ORM). Không sao chép y nguyên thương hiệu Duolingo/Memrise; chỉ học hỏi mô hình tương tác. Dùng tên riêng “Hán ngữ biển”. Giữ thông báo giấy phép MIT của mã nguồn và rà soát giấy phép phụ thuộc.

### 1.2 Đối tượng
- Học viên: người mới bắt đầu tới mức cơ bản, học trên điện thoại/trình duyệt PC.
- Biên soạn viên: tạo, sửa bản nháp khóa học, nhập bảng từ, tải âm thanh.
- Quản trị viên: quản lý tài khoản, xuất bản nội dung, sao lưu và báo cáo tổng quan.

### 1.3 Trong phạm vi MVP
Đăng nhập local; học theo khóa/chủ đề/bài; 100 mục từ mẫu chia 10 bài; flashcard, chọn đáp án, nghe âm thanh có sẵn; tiến độ theo tài khoản; quản lý nội dung và nhập CSV/XLSX; giao diện tiếng Việt; Docker Compose LAN và đóng gói airgap; kiểm thử/README/backup.

### 1.4 Ngoài phạm vi MVP
Ứng dụng iOS/Android native, chat AI/LLM, hội thoại với AI, nhận diện/chấm giọng nói chính xác, dịch máy trực tuyến, mạng xã hội, thanh toán, tổ chức nhiều cấp thực tế, đồng bộ liên đơn vị, học hoàn toàn không cần kết nối với máy chủ LAN (offline per-device), học liệu phân loại/nhạy cảm, tích hợp hệ thống xác thực của đơn vị khi chưa được cấp phép. Đừng tự thêm ngoài phạm vi trước khi MVP đạt yêu cầu.

### 1.5 Ràng buộc nghiệp vụ quan trọng
- Nội dung chuyên ngành chỉ gồm **tài liệu công khai** và dán nhãn mẫu/chưa được phê duyệt. Không xuất bản văn bản đối ngoại chính thức nếu chưa có chuyên gia ngôn ngữ và đầu mối chuyên môn duyệt.
- Không mô phỏng các chỉ thị tác chiến, liên lạc bí mật, vị trí thực tế, thông số vận hành thiết bị nhạy cảm, cấu trúc lực lượng thật, dữ liệu nhân sự thật.
- Không xem tiếng Trung như thay thế chuẩn tiếng Anh **IMO Standard Marine Communication Phrases (SMCP)** trong liên lạc an toàn hàng hải chính thức.
- Sử dụng đám mây cho **phát triển/test với dữ liệu giả**; ứng dụng vận hành cuối cùng trong LAN nội bộ, có phê duyệt phù hợp.

---

## 2. Trải nghiệm người dùng (UX)

### 2.1 Giao diện học viên
Menu tiếng Việt tối giản: `Khóa học`, `Học`, `Ôn tập`, `Tiến độ`, `Tài khoản`.
- Trang chủ: khóa đang học, tiến độ %, bài tiếp theo, nút “Tiếp tục”.
- Danh sách khóa: tên, mô tả, ảnh nội bộ, tình trạng; chọn khóa.
- Lộ trình: các chủ đề → bài có thứ tự; hiện trạng khóa/đã hoàn thành/đang học.
- Bài học: hiển thị thẻ từ (Hanzi lớn, Pinyin, nghĩa tiếng Việt), chuyển thẻ, nghe tệp âm thanh nếu có, câu hỏi chọn nghĩa hoặc chọn chữ Hán.
- Kết quả bài: số câu đúng/tổng, câu cần ôn, nút thử lại, ghi tiến độ.
- Ôn tập: các mục “cần ôn” theo thuật toán đơn giản; không giả vờ có AI cá nhân hóa.
- Mobile responsive 360–1440 px; thao tác chạm lớn, hỗ trợ bàn phím, focus rõ, không có bài bắt buộc nghe mà thiếu nội dung thay thế.
- Không ép phí, không quảng cáo, không popup bán hàng, không yêu cầu email thật cho học viên demo.

### 2.2 Giao diện biên soạn tối giản như Memrise
Thay trải nghiệm tạo 5 loại bản ghi rời rạc mặc định của React Admin bằng **wizard ngắn**, vẫn giữ React Admin/API gốc ở chế độ quản trị nâng cao nếu hữu ích:

**Màn hình A: Tạo khóa học**
- `Tên khóa`, `Mô tả`, `Mã`, `Ảnh đại diện tùy chọn`, `Trạng thái`.
- Ví dụ: `Tiếng Trung cơ bản trên biển`, `maritime-zh-basic`.

**Màn hình B: Thêm bài học**
- Chọn khóa/chủ đề, nhập tên bài, mô tả, thứ tự.
- Có nút “Dán bảng” / “Tải Excel, CSV” / “Thêm từng dòng”.

**Màn hình C: Bảng từ vựng**
- Cột bắt buộc: `hanzi`, `pinyin`, `meaning_vi`.
- Cột tùy chọn: `example_zh`, `example_pinyin`, `example_vi`, `audio_file`, `topic`, `tags`.
- Chỉnh trực tiếp dòng, tìm, lọc, xóa, sắp xếp, phát âm thanh đã tải lên.
- Không yêu cầu người soạn phải thêm từng `challengeOption`.

**Màn hình D: Xem trước → Kiểm tra → Xuất bản**
- Kiểm tra số dòng, cột thiếu, từ trùng, lỗi ký tự, không có đủ phương án nhiễu, file âm thanh thiếu.
- Hiện trước các câu hỏi tự sinh và cho sửa ngoại lệ nếu cần.
- `Lưu nháp`, `Gửi duyệt`, `Xuất bản` (chỉ admin hoặc vai trò được cấp quyền).
- Nội dung mẫu chưa kiểm duyệt phải có nhãn rõ ràng cả trang quản trị và màn hình học.

### 2.3 Luồng thao tác tối thiểu
1. Admin tạo tài khoản học viên và biên soạn viên, không mở đăng ký công khai.
2. Biên soạn viên tạo khóa/chủ đề/bài, dán 10 dòng hoặc nhập tệp, xem lỗi, lưu bản nháp.
3. Admin xem trước rồi xuất bản; học viên thấy khóa và học từng bài.
4. Học viên học, chọn đáp án, nhận phản hồi từ server, thoát ra rồi vào tiếp vẫn còn tiến độ.
5. Biên soạn viên sửa bản nháp/phiên bản mới mà không làm hỏng điểm của học viên đã học phiên bản cũ.

---

## 3. Kiến trúc kỹ thuật

### 3.1 Sơ đồ logic

```
[Browser PC / Mobile]
        |
   HTTPS trong LAN (reverse proxy/cert được phê duyệt)
        |
  [Next.js App: UI + Server Actions + REST/API]
        |        |              |
 [Local Auth] [Content & Quiz] [Admin React Admin]
        |        |              |
        +--------+--------------+
                  |
         [PostgreSQL nội bộ]
                  |
      [Backup lưu trên volume/tài nguyên được phép]

 [Local assets: images/audio/fonts] <-- app/static storage

 KHÔNG có Clerk, Neon, Stripe, CDN, external API ở runtime.
```

Kiểu triển khai: **modular monolith**, một codebase Next.js và PostgreSQL (có thể có reverse proxy như Caddy/Nginx tùy chứng chỉ TLS). Không tự làm microservices. Sử dụng phiên bản Node/LTS tương thích với Next.js thực tế; lockfile cố định và dependency audit.

### 3.2 Rà soát upstream bắt buộc
Kiểm tra trực tiếp các vị trí điển hình (đường dẫn có thể đổi theo commit):
- `db/schema.ts`: courses → units → lessons → challenges (`SELECT`, `ASSIST`) → challengeOptions; userProgress và challengeProgress.
- `db/drizzle.ts`: hiện dùng `@neondatabase/serverless` với `drizzle-orm/neon-http`; đổi sang `pg`/`drizzle-orm/node-postgres` và pool cục bộ.
- `app/layout.tsx`, `proxy.ts`, `app/(auth)`, `db/queries.ts`, `actions/*`: tích hợp Clerk; cần thay mọi điểm sử dụng.
- `lib/admin.ts`: phân quyền theo Clerk ID; thay cơ chế role trong DB và kiểm tra server-side.
- `actions/user-subscription.ts`, `lib/stripe.ts`, các promo/shop liên quan: gỡ Stripe và giới hạn trả phí. Giữ điểm thưởng nếu không phát sinh phụ thuộc thanh toán.
- `app/admin/*`, `app/api/*`: dùng React Admin (`ra-data-simple-rest`), cải thiện chức năng soạn nhanh.
- `app/lesson/quiz.tsx`: frontend hiện nắm đáp án đúng; viết API/server action chấm điểm phía server, tránh gửi `correct` trước khi trả lời.
- `app/layout.tsx`: `next/font/google` cần được thay bằng phông tự lưu trữ; không truy cập Google khi build airgap nếu chưa có asset.
- `scripts/prod.ts`: có thao tác xóa toàn bộ bảng khi seed; không chạy trên DB giữ dữ liệu, thay bằng seed an toàn.
- `next.config.ts`: xem xét loại bỏ `Access-Control-Allow-Origin: *` nếu không phục vụ yêu cầu thật; cấu hình origin/CSP phù hợp.

Tất cả quyết định phải dựa trên trạng thái repository **thực tế** trong task, không cứng nhắc với đường dẫn và version đã nêu.

### 3.3 Xác thực và phân quyền
- Không phụ thuộc OAuth/email ngoài. Dùng thư viện session/auth có uy tín (Auth.js Credentials hoặc cơ chế tương đương được bảo trì) với lưu trữ cục bộ; không tự phát minh giao thức session.
- Bảng `users`: ID UUID, username unique, password_hash (Argon2id hoặc bcrypt cấu hình đủ mạnh), role (`learner`, `author`, `admin`), active, created_at, updated_at.
- Bootstrap admin **một lần bằng CLI** (mật khẩu từ nhập kín/env chỉ dùng lúc bootstrap). Không hardcode admin/admin, không tự mở công khai signup, không lộ hash qua API/log.
- Cookie httpOnly; SameSite hợp lý; Secure ở production HTTPS; bảo vệ CSRF, đăng nhập giới hạn tốc độ/thử sai, logout, đổi mật khẩu, quản trị reset tài khoản.
- Đưa authorization vào server (không chỉ ẩn nút). `author` chỉ được soạn nháp/xem nội dung cho phép; `admin` mới quản lý users/xuất bản; `learner` chỉ thao tác khóa học và kết quả của chính mình.
- Session timeout cấu hình được. Dùng HTTPS trong LAN production với chứng chỉ phù hợp do quản trị viên cung cấp. Không tự tạo mô hình TLS giả an toàn.

### 3.4 Cơ sở dữ liệu
Giữ bảng và quan hệ Lingo nhiều nhất có thể; thêm các bảng/thuộc tính cần thiết dưới dạng **versioned migrations**. Mô hình miền đề xuất:

- `courses`: id, slug, title, description, image_path, status.
- `units`: course_id, title, description, order.
- `lessons`: unit_id, title, order, status, publication version.
- `vocabulary_entries`: id, hanzi, pinyin, meaning_vi, example_zh, example_pinyin, example_vi, audio_path, tags, provenance/source_note, review_status, created_by.
- `lesson_vocabulary`: lesson_id, vocabulary_id, display_order (liên kết nhiều-nhiều để tái sử dụng).
- `challenges`, `challenge_options`: tái sử dụng/chỉnh tối thiểu để hiển thị bài kiểm tra; generated questions phải có khóa nguồn ổn định tránh nhân đôi khi tái import.
- `users` và tiến độ theo learner; thêm `exercise_attempts` với answered_at, answer, is_correct, lesson/version để audit học tập cơ bản.
- `review_schedules` (nếu đủ điều kiện trong MVP): user_id, vocabulary_id, step, due_at, last_result cho ôn tập lặp lại.
- `content_releases` hoặc cơ chế versioning tương đương: đóng băng/đánh dấu nội dung đã xuất bản; không mutate/xóa cascaded dữ liệu liên quan tiến độ thật.

Chỉ đây là **logical design**: Codex tự chọn chính xác schema và migration để tương thích với source hiện tại và tránh overengineering. Các FK và index tối thiểu cho user, course, lesson, timestamps; dùng transaction cho xuất bản/nhập/ghi điểm. Tất cả API validate body server-side (Zod hoặc thư viện tương đương).

### 3.5 Tự tạo bài tập từ từ vựng
MVP giữ hai loại trắc nghiệm thực tế trong Lingo `SELECT`/`ASSIST` và bổ sung thẻ từ (flashcard) ở UI:
- Bài `chọn nghĩa`: hỏi Hanzi, đáp án = nghĩa tiếng Việt.
- Bài `chọn chữ`: hỏi nghĩa tiếng Việt, đáp án = Hanzi.
- Dùng đáp án nhiễu từ cùng khóa/chủ đề; lựa chọn không trùng, không vô nghĩa hoặc không phân biệt được đáp án.
- Nếu chỉ có 2–3 mục hợp lệ, cho 2–3 lựa chọn kèm cảnh báo trước xuất bản; nếu dưới 2 không sinh MCQ tự động, chỉ cho flashcard hoặc thông báo lỗi. Không tự tạo đáp án sai bịa đặt.
- Thứ tự câu hỏi/đáp án có thể trộn có seed, tránh phụ thuộc vào thứ tự cố định; đáp án đúng tuyệt đối **chấm phía server**.
- Chấm hoàn thành bài dựa trên đánh giá server và tính điểm nhất quán; test refresh/nhấn nhanh hai lần để tránh cộng điểm lặp.
- Sau khi học lần đầu, người học có thể đánh dấu từ chưa nhớ; một hệ ôn tập đơn giản (chẳng hạn ngày +1, +3, +7, +14 với reset khi sai) là đủ. Không cần AI/SRS thuật toán phức tạp.
- Pinyin nhập/hiển thị dấu chuẩn; không tự tin vào auto transliteration/polyphonic Hanzi nếu chưa có người kiểm duyệt.

### 3.6 Quản lý tệp và âm thanh
- Lưu tệp trong volume cục bộ, ví dụ `/data/media`, và metadata đường dẫn tương đối trong DB; không lưu URL HTTP của bên thứ ba.
- Upload qua admin kiểm tra dung lượng, MIME, magic bytes, tên file an toàn/UUID, không cho path traversal, ngăn file thực thi, không cho file chứa dữ liệu độc hại.
- Hỗ trợ ảnh PNG/JPEG/WebP; âm thanh MP3/WAV/OGG (chọn định dạng phù hợp trình duyệt và tài nguyên). Giới hạn cấu hình hợp lý, mặc định 5MB/tệp.
- **Không tự nhận chất lượng giọng Trung**: nếu chưa có tệp âm thanh có giấy phép và người kiểm duyệt, tính năng upload/play phải hoạt động và hiển thị thiếu âm thanh trung thực. Có thể thêm 1–2 clip demo hợp pháp để kiểm thử, không giả tiếng Trung bằng TTS không kiểm tra.
- Không gọi Google TTS/Google Translate, CDN phông, telemetry hoặc API học từ tại runtime. Đảm bảo CSS/JS/phông dùng resource nội bộ.

---

## 4. Nhập Excel/CSV và soạn bài kiểu Memrise

### 4.1 Mẫu dữ liệu
Tên cột chính xác, header tiếng Anh để thuận chuyển đổi:

`lesson_code,order,hanzi,pinyin,meaning_vi,example_zh,example_pinyin,example_vi,audio_file,tags`

- `lesson_code`: định danh bài (dùng với `course_code` + `unit_code` khi nhập nhiều bài).
- `order`: số nguyên >=1.
- `hanzi`: từ/cụm từ tiếng Trung giản thể.
- `pinyin`: Romanization có dấu thanh (không tự bắt buộc kiểm tra từ điển ở MVP).
- `meaning_vi`: nghĩa tiếng Việt.
- `example_zh`, `example_pinyin`, `example_vi`: tùy chọn.
- `audio_file`: đường dẫn asset cục bộ hợp lệ hoặc tên tệp đã upload; tùy chọn.
- `tags`: danh sách nhãn cách nhau bởi dấu chấm phẩy hoặc định dạng xác định rõ.

CSV phải đọc UTF-8, kể cả BOM; hỗ trợ XLSX không chạy macro/công thức; import tối đa 2.000 dòng/5MB mỗi lần (có thể cấu hình). Nội dung nhập không được thực thi HTML/JavaScript. Khi xuất CSV bảo vệ CSV formula injection khi giá trị bắt đầu bằng `=`, `+`, `-`, `@` hoặc ký tự điều khiển liên quan.

### 4.2 Hành vi nhập
1. Chọn bài học, dán nhiều dòng hoặc upload `.csv`/`.xlsx`.
2. Parse → hiển thị bảng preview và trạng thái từng dòng trước khi ghi DB.
3. Bắt lỗi thiếu trường, trùng khóa, giá trị rỗng, thứ tự sai, tệp quá lớn, đường dẫn tài nguyên không tồn tại; hiển thị số dòng và lý do bằng tiếng Việt.
4. Có **Dry-run** hoặc preview bắt buộc; người soạn xác nhận mới commit. Dùng transaction để không lưu nửa chừng nếu lỗi.
5. Nếu import lại cùng dữ liệu, cho lựa chọn `bỏ qua mục trùng` hoặc `cập nhật bản nháp`; bảo đảm không sinh trùng `challenges`/`options` mỗi lần.
6. Admin có thể tải file mẫu và export lại khóa/bài ra file định dạng công khai, portable.
7. Với nội dung đã xuất bản, chỉ cập nhật qua bản nháp/phiên bản mới, bảo toàn lịch sử đã học.

### 4.3 Tối ưu thao tác
Đo bằng hành động thật: người biên soạn có thể dán 10 từ vào một bài, xem preview và lưu **không phải tự tạo 10 challenge + 30–40 options**. Nếu thiếu UI upload âm thanh, phải ghi rõ chưa hoàn thành.

---

## 5. Chương trình học mẫu 10 bài

Lựa chọn chủ đề công khai, không xây bộ câu mệnh lệnh nghiệp vụ thực tế:

1. Pinyin, bốn thanh điệu và chào hỏi.
2. Giới thiệu bản thân, lịch sự và cảm ơn.
3. Số đếm, ngày giờ và lịch hẹn.
4. Nghề nghiệp, sở thích, quan hệ xã hội.
5. Thời tiết thường gặp và các mùa.
6. Phương hướng, đi lại và địa điểm công cộng.
7. Biển, bờ biển, tàu thuyền — thuật ngữ công khai cơ bản.
8. An toàn cá nhân và yêu cầu giúp đỡ dân sự (không thay IMO SMCP).
9. Giao lưu văn hóa và giới thiệu Việt Nam bằng thông tin công khai.
10. Hội thoại mẫu đơn giản: tiếp đón và xác nhận thông tin.

Mỗi bài khoảng 10 mục = tổng khoảng 100 từ/cụm từ, dùng từ/câu giản thể, Pinyin dấu thanh, nghĩa tiếng Việt, nếu có thì ví dụ. Gắn `sample_unreviewed=true`, không tự nhận đây là giáo trình chuẩn hoặc kịch bản nghiệp vụ đã phê duyệt. Khi không thể xác minh một bản dịch, thay bằng mục ít tranh cãi và ghi cần kiểm duyệt. Chất lượng quan trọng hơn đạt con số tuyệt đối 100.

---

## 6. Tính năng quản trị, báo cáo và chất lượng

### 6.1 Quản trị học viên
- Tạo, khóa/mở tài khoản; thay mật khẩu bắt buộc sau khi cấp phát nếu phù hợp.
- Không lưu email/SĐT/đơn vị công tác thật nếu chưa có nhu cầu hợp lệ và phê duyệt.
- Danh sách học viên, khóa học đang học, số bài hoàn thành, điểm; quyền truy cập có giới hạn theo role.
- Không xóa tiến độ khi biên soạn lại bài; nếu cần xóa tài khoản, xác nhận riêng và xử lý quan hệ dữ liệu rõ ràng.

### 6.2 Chất lượng UI
- Giao diện sạch, sáng sủa, màu biển xanh nhưng không bắt chước nguyên xi Duolingo.
- Hình ảnh, mascot, icon không vi phạm bản quyền; logo tạm tạo từ CSS/SVG nguyên bản hoặc icon giấy phép hợp lệ.
- Responsive màn hình nhỏ, không tràn ngang; thông báo lỗi/hoàn thành rõ; hỗ trợ giảm chuyển động; dùng aria-label/label thích hợp.
- Dùng chữ Hán/Pinyin với font được nhúng local và có quyền sử dụng, không tải từ mạng ở runtime.

### 6.3 Tính toàn vẹn
- Server quyết định đúng/sai; client chỉ gửi ID đáp án và ID câu hỏi, auth/ownership check.
- Ghi attempt và cập nhật điểm trong transaction/idempotent, tránh double credit và race.
- Không gửi trường `correct` trong payload câu hỏi trước khi học viên trả lời; không rò dữ liệu học viên giữa tài khoản.
- Thử truy cập `/admin` và `/api/admin...` khi chưa đăng nhập/không đủ role phải bị từ chối ở server.
- Hạn chế tệp upload, không cho ghi thực thi, khóa route mutation, log sự kiện quản trị ở mức phù hợp mà không ghi mật khẩu.

---

## 7. Hạ tầng phát triển cloud và bản cài offline

### 7.1 Cloud development
- Codex Cloud được phép tải npm packages, Docker images, tài liệu công khai trong phase dev nếu môi trường cho phép. Tránh dịch vụ cloud có chi phí hoặc secrets do người dùng chưa cấp.
- Không đưa dữ liệu thật vào bản preview; preview ưu tiên private. Codex không tự triển khai web công cộng.
- Tạo `.env.example`, không commit `.env` thực hoặc mật khẩu demo cố định. Seed user qua CLI.

### 7.2 Bộ cài tại máy chủ LAN
Deliverables tối thiểu:
- `Dockerfile` multi-stage hoặc cấu hình build tương đương; image pinned/immutable.
- `compose.yml` (app + postgres + volume media + storage) và tài liệu cấu hình bằng `.env`/secrets; cổng Postgres không publish ra bên ngoài.
- Có `healthcheck`, startup order, migration 1 lần, restart policy, volume persistent, timezone đúng và logging hợp lý.
- Script `backup`/`restore` bằng `pg_dump`/`pg_restore` hoặc giải pháp tương đương, thực hành restore trên DB thử nghiệm; sao lưu cả media.
- Script hoặc tài liệu xuất OCI/container images thành `.tar` với checksum SHA-256, nhập vào host airgap mà không gọi registry; bảo đảm `docker compose up` không cần pull ngoài khi image đã load.
- Quy trình cài/migrate/upgrade/rollback và xoay secrets. Xem trước qua HTTP có thể dùng cho demo cô lập, nhưng production cần reverse proxy HTTPS/chứng chỉ nội bộ do đơn vị quản lý.
- Không đưa dữ liệu thật từ cloud vào gói image. Giữ DB và media ngoài image.

### 7.3 Chứng minh không dùng Internet ở runtime
- Audit `rg` (Clerk/Neon/Stripe/GoogleFonts/CDN/external URL) và package graph thực tế.
- Quan sát request Network trong browser; các request đều tới origin LAN hoặc tài nguyên được phép, không phải host public.
- Mô phỏng container không có outbound network (cấu hình firewall/égress-deny/test network) khi app đã dựng và dữ liệu đã seed: đăng nhập, mở khóa, nghe tệp local, trả lời, logout/login lại, quản trị nhập CSV vẫn hoạt động.
- Phân biệt **runtime offline** và **airgap build/install**. Nếu chưa kiểm chứng airgap độc lập, ghi `NOT TESTED`, không tuyên bố đạt.

---

## 8. Kế hoạch thực hiện tự chủ

### Chặng A — Hạ tầng và đăng nhập độc lập
- Audit repository, giữ license, thiết lập nhánh, kế hoạch.
- PostgreSQL local, migration không phá, local auth, role, bỏ Stripe/Clerk/Neon, assets offline, bỏ CORS rộng không cần thiết.
- Smoke test 1 user đăng nhập → khóa → bài → chấm → lưu tiến độ sau reload.
- Tiêu chí: code build; không gọi Clerk/Neon/Stripe lúc runtime; role server bảo vệ.

### Chặng B — Hệ thống học và nhập nội dung
- Việt hóa, hỗ trợ tiếng Trung và Pinyin, flashcards; luồng học bài; bảng soạn bài.
- CSV/XLSX paste/import, preview, validate, publish, auto-gen MCQ, upload media.
- Tiêu chí: tạo 1 khóa/1 bài 10 từ trong vài thao tác; học được; dữ liệu lưu đúng; import trùng không nhân đôi.

### Chặng C — Nội dung mẫu, ôn tập, hoàn thiện UX
- 10 bài/100 mục mẫu review label; hoàn thiện mobile; ôn tập cơ bản; mở demo an toàn nếu môi trường cho phép.
- Tiêu chí: học liên tục 3 bài, resume, xem tiến độ; không lỗi font Hanzi/Pinyin; audio upload/play với tệp kiểm thử hợp pháp.

### Chặng D — Kiểm thử/hardening/đóng gói/bàn giao
- Unit/integration/e2e, authz, import, transaction, backup restore, offline egress, Docker Compose airgap, tài liệu.
- Tiêu chí: bảng `NGHIEM_THU.md` tất cả mục critical PASS trong môi trường kiểm thử hoặc nêu rõ trở ngại kiểm chứng; branch/PR sẵn cho review.

### Báo cáo tiến độ
Trong `IMPLEMENTATION_STATUS.md` cho mỗi chặng ghi: ngày/commit/changed files, `PASS/FAIL/NOT TESTED`, lệnh thực tế, screenshot (nếu có), rủi ro và giải thích quyết định. Không ghi “xong” khi còn critical FAIL. Đánh dấu `blocked` với cách khôi phục, không tự suy đoán.

---

## 9. Tiêu chuẩn chấp nhận và tài liệu bàn giao

Bắt buộc đọc `NGHIEM_THU.md` để biết từng testcase. Kết quả giao mày phải gồm:

1. Nhánh riêng, commits, PR hoặc diff kiểm tra được.
2. Code chạy được, `README.md` bằng tiếng Việt: khởi động dev/cloud, deploy LAN, cấu hình, migration, tạo admin, backup/restore.
3. `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, `.env.example` không lộ secret.
4. Bộ cài Docker Compose + hướng dẫn đóng gói dùng trên máy không Internet; quy trình xác minh.
5. Test và log thực; những phần chưa kiểm chứng ghi thẳng `NOT TESTED`.
6. Bộ khóa học **mẫu, chưa kiểm duyệt**, file import/export và giấy phép asset.
7. Danh sách bước cần chủ dự án/đơn vị phê duyệt: nội dung chuyên ngành, tên miền/chứng chỉ, cấu hình mạng, phân quyền production, an toàn thông tin.

**Định nghĩa DONE:** sản phẩm chạy được, không chỉ nhìn đẹp; học viên có thể học và tiếp tục học, tác giả tạo bài nhanh, admin quản lý và publish, mã nguồn có test, bản cài offline có khả năng kiểm chứng, không có phụ thuộc runtime Internet ngoài ý muốn. Hạng mục bắt buộc chưa kiểm chứng = **chưa hoàn thành nghiệm thu cuối cùng**.
