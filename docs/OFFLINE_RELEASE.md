# Gói cài local không cần source

Gói ZIP dành cho Docker **Linux/amd64** đã được chuẩn bị trên máy đích. Windows 10/11 dùng PowerShell và Docker CLI trỏ đến Linux engine phù hợp; không cần Node.js, Python, pnpm hoặc mã nguồn ứng dụng trên máy cài. Bộ cài Docker/WSL, giấy phép runtime và chứng chỉ nội bộ do người vận hành chuẩn bị riêng. Xem [Windows local](WINDOWS_LOCAL.md), [HTTPS LAN](LAN_HTTPS.md) và [vận hành/backup](LAN_DEPLOYMENT.md).

Phiên bản ứng viên `1.0.0-rc.1` không đồng nghĩa đã hoàn tất nghiệm thu trên Windows thật hoặc máy airgap độc lập. Trạng thái từng phép thử nằm trong báo cáo nghiệm thu; không suy ra PASS từ việc có ZIP.

Người nhận tải ZIP có image và checksum theo [hướng dẫn tải bản draft](DOWNLOAD_LOCAL.md). File Source code (zip) tự sinh của GitHub không phải bộ cài offline. Chỉ dùng draft có run hoàn tất và checksum khớp.

## Build trên máy được phép có Internet

Máy build cần Git, Python 3, Docker/Compose và dependency build theo README. Commit các thay đổi trước khi build; không trộn image, source hoặc tag của bản khác. Dùng tag phiên bản mới để giữ bản đang chạy cho rollback.

```bash
export RELEASE_VERSION=1.0.0-rc.1
export HANNGU_IMAGE=han-ngu-bien:$RELEASE_VERSION
export HANNGU_TOOLS_IMAGE=han-ngu-bien-tools:$RELEASE_VERSION
scripts/docker-build.sh
scripts/offline-export.sh work/hnb-images.tar.gz
python3 scripts/package-offline.py \
  --images work/hnb-images.tar.gz \
  --output work/releases/han-ngu-bien-1.0.0-rc.1-linux-amd64.zip \
  --version "$RELEASE_VERSION"
```

Builder yêu cầu app/tools mang cùng nhãn OCI revision/version và `vn.hanngubien.build-method=source-docker`, đúng image ID trong manifest đã xuất. Source commit phải là tổ tiên của checkout hiện tại, và phần runtime không được thay đổi sau lúc build image. Có thể cập nhật tài liệu, kiểm thử hoặc công cụ vận hành mà không rebuild runtime; `sourceCommit` và `packagingCommit` được ghi riêng trong `RELEASE.json`. Checkout phải sạch trước và sau khi tạo ZIP.

`package-offline.py` không pull, build, khởi động container, chạm DB hoặc đọc secrets runtime. Nó xác minh SHA của archive và manifest trước Docker inspect; chỉ nhận bốn image đúng vai trò, cùng Linux/amd64. Image có environment key dạng mật khẩu/token/secret bị từ chối. Bản đóng gói từ standalone fallback không tự được coi là source Docker release.

## Nội dung và kiểm tra gói

ZIP có danh sách tệp cho phép: Compose HTTP/TLS, cấu hình mẫu, PowerShell, công cụ backup/restore/load/check offline, tài liệu, giấy phép và CSV/WAV mẫu. Ứng dụng nằm trong bốn image tại `images/hnb-images.tar.gz`; không có cây source, `.env` thật, DB dump, tài khoản kiểm thử, file người học, chứng chỉ/private key hoặc dependency phát triển.

- `RELEASE.json` ghi phiên bản, nền tảng, source commit, packaging commit và ref/ID từng image. PowerShell dùng các ref này để tạo cấu hình riêng.
- `SHA256SUMS` bảo vệ mọi thành viên ZIP khác, kể cả archive image.
- `images/hnb-images.tar.gz.sha256` bảo vệ image archive và `.images` khi nạp bằng script hiện có.
- File ZIP có `.zip.sha256` đi kèm. So sánh hash ZIP với giá trị nhận qua nguồn đáng tin trước khi giải nén/chạy script.

Ví dụ kiểm tra trên Windows:

```powershell
Get-FileHash .\han-ngu-bien-1.0.0-rc.1-linux-amd64.zip -Algorithm SHA256
```

Checksum phát hiện lỗi truyền hoặc sửa đổi so với manifest; nó **không chứng minh danh tính người phát hành** nếu cả gói và checksum cùng bị thay thế. Chỉ nhận bộ cài qua kênh được phép. Builder xuất bằng tệp tạm và publication không ghi đè; nếu thất bại, không dùng ZIP thiếu checksum hoàn tất.

Giải nén vào thư mục riêng có đủ dung lượng; đọc `docs/WINDOWS_LOCAL.md` trong gói rồi nạp image, cấu hình secrets riêng, migrate, tạo admin và khởi động. Không chép `.env` hoặc backup của instance khác vào bộ cài. Không mở cổng PostgreSQL. Không bật pull/build trên máy không Internet.

## Kiểm thử builder

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_release_package.py
```

Các phép thử dùng Git và Docker giả trong thư mục tạm: checksum sai/manifest trùng, image sai ID/kiến trúc/version/provenance, secret trong image, source chưa commit hoặc đã thay runtime, symlink, đường dẫn output thoát `work`, archive đổi giữa chừng và race publication. Chúng không chứng nhận image đã khởi động, backup đã phục hồi hoặc Windows/airgap thật; các phép kiểm đó phải có bằng chứng riêng.
