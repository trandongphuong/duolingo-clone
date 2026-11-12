# Báo cáo ứng viên triển khai local

Ngày cập nhật: **2026-11-12**, Asia/Bangkok. Nhánh `feat/han-ngu-bien-local-release`, phiên bản đóng gói **1.0.0-rc.1**, Linux/amd64 cho Docker trên Windows10/11 hoặc máy Linux được quản lý.

**Chưa hoàn tất nghiệm thu cuối trên máy đích.** Báo cáo này bổ sung cho [nghiệm thu nền tảng](ACCEPTANCE_REPORT.md); Windows/WSL2 thực tế và máy airgap độc lập vẫn cần bằng chứng riêng. Không suy ra chứng nhận từ việc đã có bộ cài hoặc demo Render.

## Thay đổi đã kiểm tra

- Khóa/kiểm lại actor trong transaction ghi nội dung và media; không dùng role đã bị thu hồi giữa request. Upload lỗi chỉ dọn đúng file mới tạo.
- PowerShell native: cấu hình RNG/ACL, kiểm Docker Linux/local context, nạp image SHA/ID, khởi động offline, cấp admin bằng stdin, dừng và sao lưu/phục hồi binary.
- HTTPS LAN với CA/certificate người vận hành cấp, Secure cookie, một cổng TLS và healthcheck loopback; không ACME hoặc Internet runtime.
- Backup/restore có khóa bảo trì, staging và journal; export/publish artifact không để lại tên gói hoàn tất khi thất bại. Gói ZIP allowlist không mang secrets, DB hoặc media người học.

## Kết quả hiện có

| Phép kiểm | Kết quả | Bằng chứng/phạm vi |
|---|---|---|
| Lint/typecheck và production build | PASS | ESLint/tsc exit0; Next compile42s,TypeScript25.7s,30/30prerender; build chuẩn bị standalone |
| Unit và PostgreSQL integration | PASS | 75/75,fail0,skip0,31.4s; gồm22faulttests vận hành và6race phân quyền nội dung |
| HTTP upload đang bị thu hồi quyền | PASS | 2race thật, chờ đúng actor-rowlock rồi403; DB/files không đổi; [log](verification/media-revocation.txt) |
| Standalone browser E2E | PASS | 9/9,2.1phút; RBAC/import/wizard/media/3bài/resume/360–1440px |
| Builder ZIP guard | PASS | Python stdlib11tests; checksum, imageID/arch/version/source, symlink, secret và publication race |
| PowerShell helper | PASS trong môi trường hỗ trợ | pwsh7.6.9/Linux13tests; backup/restoremocks, binary+GNUtar; Windows5.1/ACL/engine không được suy ra PASS từ đây |
| Source Docker build/image RC | NOT TESTED tại checkpoint này | Đang chuẩn bị build với tag/OCIprovenance riêng; không ghi đè image1.0 |
| Compose offline/TLS/backup-restore RC thật | NOT TESTED tại checkpoint này | Sẽ chạy trên DB/volume test mới; bằng chứng bổ sung sau khi chạy |
| Windows10/11 + Docker/WSL2 và airgap độc lập | NOT TESTED | Không có quyền vào máy đích; D02 và xác minh chứng chỉ/firewall/engine cần nghiệm thu tại chỗ |

Các kết quả đang chờ được cập nhật bằng log thực tế trước khi bàn giao. Không dùng RC để tự triển khai production. Gói không tự cài Docker, chấp nhận giấy phép hoặc thay đổi firewall/CA máy thật. Chỉ dùng ngữ liệu giả/chưa thẩm định cho demo; giáo trình chuyên môn cần người có trách nhiệm duyệt.
