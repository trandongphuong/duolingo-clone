# BỘ GIAO VIỆC CHO CODEX — HÁN NGỮ BIỂN 1.0

Bản phát hành đặc tả: 2026-11-09 | Trạng thái: tài liệu giao việc, **chưa phải ứng dụng đã lập trình**.

## Mục đích

Giúp Codex Cloud tự triển khai MVP từ repository `sanidhyy/duolingo-clone`, hỏi người chủ dự án rất ít, nhưng không bỏ qua chất lượng và an toàn dữ liệu. Ứng dụng được lập trình và kiểm thử trên cloud, sau đó đóng gói để có thể vận hành hoàn toàn trong LAN khi được phê duyệt.

## Tệp trong bộ này

- `PROMPT_GIAO_VIEC.md`: lời giao việc chính để sao chép vào Codex.
- `SPEC_CHI_TIET.md`: yêu cầu sản phẩm, UI, kiến trúc, dữ liệu, chức năng, tiêu chí thực hiện.
- `AGENTS.md`: quy tắc tác nghiệp dài hạn dành cho Codex; nên đặt ở thư mục gốc repository.
- `NGHIEM_THU.md`: kiểm thử và bằng chứng cần báo cáo trước khi hoàn thành.
- `templates/vocabulary_sample.csv`: minh họa định dạng nhập bài học (ít dòng, không phải bộ 100 từ đã được kiểm duyệt).

## Cách dùng nhanh nhất

1. Bảo đảm Codex Cloud đã chọn repository fork riêng của Lingo.
2. Đưa `AGENTS.md`, `SPEC_CHI_TIET.md`, `NGHIEM_THU.md`, `PROMPT_GIAO_VIEC.md` vào thư mục gốc của repository hoặc cung cấp nội dung tương đương cho Codex trong tác vụ; đưa CSV vào `templates/`. **Không cần cài gì trên máy cá nhân.** Có thể thêm các file qua giao diện GitHub trên web.
3. Mở Codex Cloud, dán toàn bộ `PROMPT_GIAO_VIEC.md` và giao nhiệm vụ trên nhánh mới.
4. Chỉ cần xem 3 mốc nghiệm thu: (A) LAN-only và đăng nhập; (B) biên soạn + bài học; (C) chạy thử, kiểm thử, đóng gói.
5. Đừng nhập thông tin nội bộ hạn chế, dữ liệu cá nhân thật, tài khoản thật hoặc bí mật của đơn vị vào cloud/GitHub.

Nếu hiện tại Codex chưa đọc được các file, hãy cung cấp các file này trước khi dùng prompt. **Prompt ngắn không thể thay thế toàn bộ đặc tả.**

## Tuyên bố giới hạn

- Đây là thiết kế kỹ thuật đề xuất, không chứng minh phần mềm đã vượt qua kiểm thử.
- Đơn vị có trách nhiệm cấp phép/quy trình để triển khai mạng thật, phê duyệt nội dung đối ngoại/hàng hải và kiểm tra an toàn thông tin.
- Codex có thể gặp giới hạn công cụ hoặc phiên chạy: tiếp tục trong **cùng tác vụ** (nếu được hỗ trợ), không hiểu lầm rằng mọi công việc đã tự động hoàn tất.

## Nguồn tham khảo

- Lingo: https://github.com/sanidhyy/duolingo-clone
- Codex Cloud: https://help.openai.com/en/articles/20001545-using-codex-cloud
- IMO SMCP: https://www.imo.org/en/ourwork/safety/pages/standardmarinecommunicationphrases.aspx
