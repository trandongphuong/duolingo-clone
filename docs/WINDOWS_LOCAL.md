# Cài local trên Windows 10/11

Bản này chạy ứng dụng thật cùng PostgreSQL và media trong Linux containers, dùng trình duyệt trên Windows để học/biên soạn. Không cần Node.js, pnpm, Git Bash hoặc Internet khi đã có gói image và Docker được chuẩn bị. Bộ cài ứng dụng không tự cài Docker/WSL, đổi firewall, chấp nhận giấy phép hoặc xóa dữ liệu.

## Chuẩn bị máy

- Windows còn được nhà cung cấp engine hỗ trợ, CPU x64, bật ảo hóa và có đủ RAM/dung lượng cho Linux containers, database, media và backup. Kiểm tra yêu cầu hiện hành tại [Docker cho Windows](https://docs.docker.com/desktop/setup/install/windows-install/); chỉ có nhãn Windows 10/11 không bảo đảm mọi phiên bản đều tương thích.
- Windows PowerShell **5.1+** hoặc PowerShell **7+** trên Windows; Docker CLI trỏ tới engine **Linux/amd64 trên máy này**, qua named pipe; Docker Compose **2.24.4+**. `Doctor` từ chối Windows containers, ARM, remote TCP/SSH context và biến `DOCKER_HOST`/TLS override. Nó không tự chuyển context hoặc tự cài/nâng cấp engine.
- Nếu dùng Docker Desktop, chủ máy phải kiểm tra [điều kiện giấy phép](https://docs.docker.com/subscription-billing/desktop-license/). Docker nêu các cơ quan chính phủ cần subscription trả phí; không mặc định Docker Desktop miễn phí cho triển khai cơ quan. Có thể vận hành Docker Engine trên máy Linux được quản lý hoặc trong môi trường WSL2 do kỹ thuật viên chuẩn bị; trường hợp dùng CLI Linux trong WSL thì theo [hướng dẫn LAN](LAN_DEPLOYMENT.md), không dùng PowerShell entry point này. Không tự mua subscription.
- Giải nén gói đã xác minh SHA-256 từ nguồn được phê duyệt vào thư mục NTFS do người vận hành sở hữu, ví dụ `C:\HanNguBien`. Giữ đủ cấu trúc `compose.yaml`, `scripts`, `docs/docker`, `images` và `RELEASE.json`. Không dùng thư mục tạm hoặc thư mục chia sẻ công cộng để chứa cấu hình/backup.

Gói không chứa tài khoản hoặc mật khẩu. `.env` được sinh riêng trên máy cài, bằng RNG mật mã; mật khẩu database và session khác nhau. ACL của file chỉ cấp cho người tạo, SYSTEM và Administrators. Gói image có kiểm SHA-256 và image ID; checksum phát hiện lỗi truyền, không thay cho xác minh nguồn phát hành.

Mở PowerShell, vào thư mục gói:

```powershell
Set-Location 'C:\HanNguBien'
```

Tuân thủ chính sách thực thi script/ký mã của đơn vị. Nếu Windows đánh dấu gói tải từ Internet, chỉ gỡ chặn sau khi đã xác minh nguồn và checksum theo quy định; không đổi execution policy toàn máy sang Unrestricted/Bypass để chạy bộ cài.

## Chạy thử trên chính máy Windows

Mặc định chỉ mở HTTP tại `127.0.0.1:3000`, không cho máy khác kết nối. Chế độ này dành cho thử nghiệm cô lập; LAN vận hành dùng HTTPS ở mục sau.

```powershell
.\scripts\windows\HanNguBien.ps1 -Action Configure
.\scripts\windows\HanNguBien.ps1 -Action LoadImages
.\scripts\windows\HanNguBien.ps1 -Action Doctor
.\scripts\windows\HanNguBien.ps1 -Action Start -SampleData
.\scripts\windows\HanNguBien.ps1 -Action CreateAdmin -Username quantri -DisplayName 'Quản trị thử nghiệm'
```

`Configure` từ chối ghi đè file đã tồn tại; không dùng nó để xoay mật khẩu database trên volume cũ. Khi có `RELEASE.json`, cấu hình lấy đúng tag image của bản phát hành; Doctor/Start kiểm cả ID và kiến trúc để phát hiện tag bị gán nhầm. `LoadImages` mặc định đọc `images/hnb-images.tar.gz` và hai sidecar `.images`, `.sha256`; không tải registry. Có thể dùng `-ImageArchive 'D:\Goi cai\hnb-images.tar.gz'`. Tag cũ có nội dung khác bị từ chối ghi đè; giữ bản cũ để rollback và nhận gói mới dùng tag version riêng.

Doctor/Start kiểm lại địa chỉ bind trong cấu hình, kể cả sau khi sửa `.env`: chỉ cho loopback hoặc IPv4 private, không chấp nhận `0.0.0.0` hay địa chỉ public. Các biến bind/image/secret và điều khiển Compose từ môi trường cha không được ghi đè file đã kiểm tra; proxy và cấu hình Docker được giữ nguyên. Manifest của gói khác bị từ chối trước khi nạp image.

`Start` giữ khóa bảo trì, chờ database healthy, chạy migration versioned rồi mở app/ingress với `--no-build --pull never`. Nếu đang chạy, app/ingress tạm dừng khi migration để tránh truy cập giữa cập nhật. Khi có lỗi, không tự xóa volume hoặc phục hồi database; kiểm tra Status trước khi chạy lại. `-SampleData` là lựa chọn rõ ràng để thêm bộ mẫu chưa kiểm duyệt, chạy lại không xóa tiến độ; bỏ cờ này nếu không muốn thêm mẫu.

`CreateAdmin` hỏi mật khẩu kín và xác nhận, tối thiểu 12 ký tự, tối đa 72 byte UTF-8. Mật khẩu đi qua stdin UTF-8, không qua command line hoặc `.env`. Tài khoản đã tồn tại không bị reset. Không có mật khẩu mặc định.

Mở **http://localhost:3000**, đăng nhập bằng username vừa tạo, rồi cấp tài khoản author/learner trong ứng dụng. Media và PostgreSQL nằm trong Docker volumes, không nằm trong thư mục giải nén hoặc image.

```powershell
.\scripts\windows\HanNguBien.ps1 -Action Status
.\scripts\windows\HanNguBien.ps1 -Action Stop
.\scripts\windows\HanNguBien.ps1 -Action Start
```

`Stop` chỉ dừng các dịch vụ của project đã chọn, giữ nguyên volumes. Không dùng `docker compose down -v`, `docker volume prune` hoặc xóa thư mục dữ liệu để cập nhật ứng dụng.

## HTTPS cho các máy trong LAN

Tên miền/IP LAN, chứng chỉ, khóa PEM, trust CA trên máy học viên và firewall phải được người quản lý cấp/phê duyệt. Bộ cài không gọi ACME/Let's Encrypt và không tự tạo chứng chỉ production. Chọn địa chỉ IPv4 private cụ thể; entry point từ chối địa chỉ public và `0.0.0.0` để tránh mở nhầm mọi giao diện mạng.

Ví dụ dưới dùng tên miền và IP minh họa; thay bằng giá trị thật đã được phép. Origin, port, chứng chỉ SAN và DNS/hosts phải khớp. Chọn cấu hình/project riêng, không sửa/xóa instance thử nghiệm đã có dữ liệu.

```powershell
.\scripts\windows\HanNguBien.ps1 -Action Configure -EnvironmentFile '.\.env.lan' -ProjectName hanngubien-lan -Tls -Origin 'https://hanngubien.internal:8443' -ListenAddress '192.168.1.20' -CertificateFile 'C:\ChungChi\server.crt' -PrivateKeyFile 'C:\ChungChi\server.key'
.\scripts\windows\HanNguBien.ps1 -Action Doctor -EnvironmentFile '.\.env.lan' -Tls
.\scripts\windows\HanNguBien.ps1 -Action Start -EnvironmentFile '.\.env.lan' -Tls -SampleData
.\scripts\windows\HanNguBien.ps1 -Action CreateAdmin -EnvironmentFile '.\.env.lan' -Tls -Username quantri
```

Giữ `-EnvironmentFile` và `-Tls` nhất quán cho các thao tác sau. `compose.tls.yaml` thay cổng HTTP bằng HTTPS, không mở thêm cổng DB; cookie Secure được bật. `Doctor` kiểm file chứng chỉ có sẵn và cấu hình, không tự chứng nhận CA hoặc chất lượng chứng chỉ. Không bỏ qua cảnh báo TLS trong trình duyệt để nghiệm thu.

## Sao lưu và phục hồi

Backup chứa hash mật khẩu, phiên và tiến độ; lưu trong thư mục được phép, bảo vệ/mã hóa theo chính sách của đơn vị. Dùng đường dẫn chưa tồn tại. `-StopApp` cho phép tạm dừng app để ảnh DB/media nhất quán; app được khởi động lại nếu ban đầu đang chạy. Binary dump/tar được truyền bằng stream, không dùng toán tử `>` của Windows PowerShell 5.1. Archive media được kiểm tra trước khi công bố backup hoàn chỉnh; lỗi ghi stream sẽ dừng tiến trình thay vì để producer chờ vô hạn.

```powershell
.\scripts\windows\HanNguBien.ps1 -Action Backup -BackupDirectory 'D:\HnbBackup\backup-20261111' -StopApp
```

Phục hồi **thay thế DB và media của project đang chọn**. Trước tiên thử trên project/config riêng có dữ liệu giả; với dữ liệu thật phải được chủ dữ liệu phê duyệt và có backup hiện trạng. Ví dụ dưới yêu cầu file `.env.restore-test` đã được tạo riêng bằng Configure với `-ProjectName hanngubien-restore-test -Origin http://localhost:3001`; không dùng file/env/volume của production.

```powershell
.\scripts\windows\HanNguBien.ps1 -Action Restore -EnvironmentFile '.\.env.restore-test' -BackupDirectory 'D:\HnbBackup\backup-20261111' -ConfirmReplace
.\scripts\windows\HanNguBien.ps1 -Action Start -EnvironmentFile '.\.env.restore-test'
```

Restore kiểm checksum và archive, khởi động riêng database của project đã chọn bằng image sẵn có, rồi kiểm dump/staging trước khi thay dữ liệu. App phải dừng và không được tự bật sau restore hoặc khi lỗi. Kiểm nội dung, tài khoản, điểm/tiến độ và SHA media trước/sau; không chỉ kiểm exit code. Nếu có `.hnb-restore.lock` hoặc staging bảo trì được giữ lại, Start từ chối mở app. Không xóa lock/staging bằng tay khi chưa xác định không còn tác vụ bảo trì và đã có phương án khôi phục; đọc thông báo lỗi/hướng dẫn LAN hoặc nhờ kỹ thuật viên kiểm tra.

## Nâng cấp và giới hạn kiểm chứng

Giữ nguyên thư mục/gói/config của bản cũ. Backup và thử restore trước; nhận gói mới dùng tag version mới, xác minh SHA/ID, rồi thử ở project riêng trước cửa sổ bảo trì. Chỉ dùng lại `.env`/project cũ khi người vận hành đã đối chiếu image version, migration và có kế hoạch rollback. Đổi biến `POSTGRES_PASSWORD` trong `.env` không tự đổi mật khẩu trên volume PostgreSQL đã tồn tại. Xem thêm [quy trình LAN](LAN_DEPLOYMENT.md).

Syntax và mô phỏng transport có thể kiểm trên PowerShell7/Linux; điều đó không thay cho Windows PowerShell5.1 thật, ACL/NTFS, Docker Desktop/WSL, trust CA, firewall hoặc máy airgap độc lập. Chỉ đánh dấu PASS sau khi chạy được trên máy đích; trạng thái thực tế nằm trong `IMPLEMENTATION_STATUS.md` và báo cáo nghiệm thu. Bộ Windows entry point không tự triển khai vào hạ tầng thật.
