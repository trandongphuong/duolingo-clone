# Phụ thuộc và chuỗi cung ứng

Giữ LICENSE MIT upstream. Lockfile pnpm11.11.0 cố định phân giải; không tự tải package ở runtime. Không còn Clerk, Neon, Stripe hoặc Vercel SDK trong dependencies. React Admin disableTelemetry; Next telemetry tắt trong dev/start/Compose.

| Thư viện trực tiếp | Phiên bản cài | Giấy phép package |
|---|---|---|
| @radix-ui/react-avatar | 1.3.1 | MIT |
| @radix-ui/react-dialog | 1.3.0 | MIT |
| @radix-ui/react-progress | 1.2.1 | MIT |
| @radix-ui/react-separator | 1.2.0 | MIT |
| @radix-ui/react-slot | 1.5.0 | MIT |
| bcryptjs | 3.0.3 | BSD-3-Clause |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| dotenv | 18.0.1 | BSD-2-Clause |
| drizzle-orm | 0.45.4 | Apache-2.0 |
| exceljs | 4.4.0 | MIT |
| iron-session | 9.0.1 | MIT |
| lucide-react | 1.52.0 | ISC |
| next | 16.4.3 | MIT |
| papaparse | 5.7.0 | MIT |
| pg | 8.23.1 | MIT |
| ra-data-simple-rest | 5.15.3 | MIT |
| react | 19.3.0 | MIT |
| react-admin | 5.15.4 | MIT |
| react-circular-progressbar | 2.2.0 | MIT |
| react-confetti | 6.4.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-use | 17.6.1 | Unlicense |
| sonner | 2.0.8 | MIT |
| tailwind-merge | 3.7.0 | MIT |
| tailwindcss-animate | 1.0.7 | MIT |
| zod | 4.6.7 | MIT |
| zustand | 5.0.15 | MIT |

Noto Sans/Noto Sans SC: SIL OFL1.1; xem docs/ASSET_LICENSES.md và public/fonts. Logo và âm sin kiểm thử là nội dung tự tạo của dự án. Không dùng bản ghi Mandarin chưa có quyền/thẩm định.

Lệnh audit: `corepack pnpm audit --prod --json`; kết quả và giới hạn ghi trong docs/ACCEPTANCE_REPORT.md. Danh mục này là bằng chứng rà soát kỹ thuật, không thay tư vấn giấy phép pháp lý hoặc phê duyệt an toàn thông tin.
