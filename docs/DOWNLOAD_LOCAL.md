# Tải bộ cài local từ GitHub

Bộ cài offline là file **`han-ngu-bien-<version>-linux-amd64.zip`** và checksum **`.zip.sha256`**. File **Source code (zip)** do GitHub tự sinh chỉ chứa mã nguồn, không có bốn image và không phải bộ cài Windows ngoại tuyến.

## Nơi nhận gói

1. Đăng nhập GitHub bằng tài khoản chủ repository hoặc có quyền ghi.
2. Mở [workflow Build local installer draft](https://github.com/trandongphuong/duolingo-clone/actions/workflows/local-release.yml). Chọn run của nhánh `feat/han-ngu-bien-local-release` và đúng commit muốn nghiệm thu. Chỉ dùng run đã thành công; không suy ra có gói hoàn chỉnh từ việc workflow được tạo.
3. Trong Summary của job, mở **Open the draft release**. Cũng có thể tìm draft trong [Releases](https://github.com/trandongphuong/duolingo-clone/releases) khi đã đăng nhập tài khoản có quyền ghi. Draft không phải bản phát hành công khai và không hiện cho khách chưa được cấp quyền.
4. Trong Assets, tải đúng file ZIP bộ cài và `.zip.sha256`. So sánh SHA-256 bằng PowerShell trước khi giải nén:

```powershell
Get-FileHash .\han-ngu-bien-1.0.0-rc.1-linux-amd64.zip -Algorithm SHA256
Get-Content .\han-ngu-bien-1.0.0-rc.1-linux-amd64.zip.sha256
```

Hash phải khớp giá trị trong file checksum và Summary của run tin cậy. Checksum phát hiện lỗi truyền; nó không xác minh danh tính nhà phát hành nếu cả gói và checksum cùng bị thay. Chỉ nhận gói qua kênh đã được phép.

Giải nén ZIP vào thư mục riêng, rồi đọc [hướng dẫn Windows](WINDOWS_LOCAL.md). Docker/WSL, giấy phép engine, chứng chỉ LAN và firewall được chuẩn bị riêng. Gói không yêu cầu Node.js, pnpm, Python hay Git Bash trên máy cài, và không kèm credentials hoặc dữ liệu người học.

## Workflow thực hiện gì

Workflow chạy tự động khi file `.github/workflows/local-release.yml`, helper `scripts/windows/**`, kiểm thử `tests/windows-*.ps1` hoặc packager `scripts/package-offline.py` được cập nhật trên nhánh local release. Các commit mã/tài liệu khác không tự tạo thêm bản build. `workflow_dispatch` dùng được khi workflow đã hiện trong default branch theo quy tắc GitHub; không tự merge để bật chức năng này.

Workflow chỉ cho phép repository public hiện tại và runner Windows/Ubuntu tiêu chuẩn. Job Windows chạy hai bộ kiểm thử helper bằng **Windows PowerShell 5.1**; Docker được mô phỏng trong các bài này, không cần/cài Docker engine trên runner Windows. Job Ubuntu chỉ tiếp tục khi job Windows PASS: checkout đúng SHA, không lưu Git credentials, chạy guard tests của packager, build image từ source đã commit, xuất image và đóng ZIP theo allowlist. Token GitHub chỉ được đưa vào bước tạo/upload draft; không đưa token vào Docker build, image hoặc bộ cài. Job Windows có `contents: read`; quyền `contents: write` của job Ubuntu chỉ phục vụ draft release trong repository này. Không deploy web, đổi Render, merge main hoặc publish release.

Tag draft có dạng `local-<version>-<12 ký tự SHA>`, trỏ đúng full commit SHA. Mỗi draft chỉ nhận đúng hai asset của bộ cài. Workflow không ghi đè asset, không force-push tag và không tự xóa draft cũ. Nếu chạy lại, asset đã có chỉ được giữ khi tên, kích thước và SHA-256 do GitHub trả về khớp chính xác; chỉ asset còn thiếu mới được upload. Nếu nội dung khác hoặc metadata thiếu digest, job dừng để người quản lý kiểm tra. Build Next/Docker có thể không tạo lại byte giống hệt, nên rerun cùng commit có thể bị từ chối; không xóa/ghi đè tự động để che lỗi. Không publish draft trong lúc job đang upload.

Nếu push workflow bị từ chối do thiếu quyền workflow-write, hoặc GitHub Actions đang tắt trên fork, chủ tài khoản phải xử lý quyền/cấu hình qua GitHub. Không gửi token vào chat. Nếu build/upload thất bại, draft có thể còn thiếu file; không xem đó là bộ cài hoàn chỉnh. Phải xem log và chạy lại theo quy trình hoặc tạo version mới sau khi rà soát.

## Chi phí và giới hạn nghiệm thu

GitHub nêu [runner tiêu chuẩn cho repository public vẫn miễn phí](https://docs.github.com/en/billing/concepts/product-billing/github-actions); runner lớn có thể tính phí nên workflow không dùng chúng. File được lưu bằng [Release assets](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases): mỗi asset dưới 2 GiB, không có giới hạn tổng kích thước release hoặc băng thông. Workflow không dùng `upload-artifact`, cache hoặc custom runner/image trả phí. Nếu repository chuyển private, job bị bỏ qua để tránh tự chuyển sang usage tính phí.

Workflow/gói tải thành công chỉ chứng minh phần build và phân phối đã ghi nhận. Job Windows có thể chứng minh syntax/logic/transport dưới PowerShell 5.1 trên runner đó khi đã chạy PASS; không thay cho kiểm tra Docker/WSL thật trên máy đích, trust CA/firewall và chuyển sang máy airgap độc lập. Xem [đóng gói offline](OFFLINE_RELEASE.md), `IMPLEMENTATION_STATUS.md` và báo cáo nghiệm thu trong gói. Không gọi bản RC là nghiệm thu hoàn tất khi còn tiêu chí bắt buộc NOT TESTED.
