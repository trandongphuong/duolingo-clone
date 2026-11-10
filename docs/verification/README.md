# Bằng chứng kiểm thử

Các log/ảnh ở đây chỉ chứa dữ liệu giả của bộ kiểm thử. Không có `.env`, mật khẩu, cookie, trace, database dump hoặc media của người học thật. `results.json` ghi lệnh, kết quả và phạm vi.

- 41/41 unit/integration,9/9E2E standalone và9/9E2E Compose chặn egress.
- `container-recreate.log` và các file db/media trước–sau: dữ liệu giữ nguyên khi recreate và restore.
- `e2e-restored-smoke.log`: đăng nhập lại,800điểm,3/10bài,phátWAV,logoutthu hồi quyền.
- `observed-image-ids.txt`/`observed-image-sha256.txt` ghi bộ image251MiB đã kiểm chứng. Archive binary được giữ ngoài Git tại workspace thử nghiệm; các file này là bằng chứng, không phải image để cài. Dùng scripts/docker-build.sh hoặc docker-package-built.sh rồi offline-export.sh để tạo gói bàn giao trên máy build được phép.

Máy airgap độc lập và LAN production thật vẫn NOT TESTED; không suy ra chứng nhận từ thử nghiệm cloud. Xem ../ACCEPTANCE_REPORT.md.
