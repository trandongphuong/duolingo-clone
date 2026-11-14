# Báo cáo ứng viên triển khai local

Ngày cập nhật: **2026-11-13**, Asia/Bangkok; các phép kiểm runtime dưới đây chạy ngày12/11. Nhánh `feat/han-ngu-bien-local-release`, phiên bản đóng gói **1.0.0-rc.1**, Linux/amd64 cho Docker trên Windows10/11 hoặc máy Linux được quản lý.

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
| Production dependency audit | PASS | 0advisory ở mọi mức; lockfile không đổi |
| Source Docker build/image RC | PASS | Frozeninstall30.7s,Nextcompile26.7s,TypeScript13.4s; source `c5e68f3`; app/tools có OCIrevision/version/build-method |
| Compose browser dưới egress-deny | PASS | 9/9,3.6phút; DB private; app không defaultIPv4route và publicTCP ENETUNREACH |
| HTTPS và readiness | PASS trong cloud | CA đúng→HTTP200, CA chưa tin→curl60; cookieSecure/HttpOnly/Lax,logout/replay401; readiness từ chối mật khẩu DB sai và session secret quá ngắn |
| Backup/restore DB và media thật | PASS | Instance/volumes mới,16table+sequencefingerprint khớp; 3khóa/12bài/120mục/800điểm/4bài hoàn thành/2media; byte/range đọc qua HTTPS saurestore khớp |
| ZIP thực tế và image transfer cùng daemon | PASS | Gói khoảng252MiB; CRC/từng SHA256/metadata/allowlist đã kiểm; export/load bốn image khớp ID, không registry |
| Đường dẫn tải draft qua CI | ĐANG KIỂM CHỨNG | Workflow chỉ chạy trên public runner và tạo draft; chỉ dùng run hoàn tất, xem [hướng dẫn tải](DOWNLOAD_LOCAL.md) |
| Windows10/11 + Docker/WSL2 và airgap độc lập | NOT TESTED | Không có quyền vào máy đích; D02 và xác minh chứng chỉ/firewall/engine cần nghiệm thu tại chỗ |

Bằng chứng: [kiểm tra local](verification/local-release-checks.txt), [TLS](verification/local-tls.txt), [thu hồi quyền upload](verification/media-revocation.txt). Fingerprint DB+sequence sau restore: `349b3689ac8c54230c609eccbd16037e53da8038c9be44d8fef8d5d7e80d8e1f`.

ZIP mang `RELEASE.json`, image archive và các SHA256; lấy hash của gói cụ thể từ `.zip.sha256` và run/draft đã được xác minh. Image transfer cùng daemon không được tính thành máy airgap độc lập.

Không có FAIL ứng dụng đang mở trong các phép kiểm trên. ENOSPC của ổ cloud8GB đã được xử lý bằng dọn cache build, giữ nguyên volumes; không xem lần tạo container lỗi do dung lượng là PASS trước khi chạy lại thành công. Quyền đọc public nginx config/certificate trong workspace đã sửa trước khi kiểm TLS; key fixture chỉ phục vụ kiểm thử, không phát hành.

Các phần còn phải nghiệm thu/phê duyệt:

- Windows/WSL2, engine và đủ tài nguyên/giấy phép phù hợp trên máy đích; PowerShell/Linuxmocks không chứng nhận toàn bộ Windows.
- D02: chuyển/nạp gói và chạy trên máy airgap độc lập, không registry hoặc package download.
- Tên miền, CA/certificate nội bộ, firewall, quyền tài khoản và backup policy trước vận hành thật.
- Học liệu mẫu/chuyên môn và giọng đọc cần người có trách nhiệm thẩm định; WAV thử là âm sin.

Không dùng RC để tự triển khai production. Gói không tự cài engine, chấp nhận giấy phép hoặc đổi firewall/CA máy thật. Không tuyên bố hoàn tất nghiệm thu khi D02/máy đích còn NOT TESTED.
