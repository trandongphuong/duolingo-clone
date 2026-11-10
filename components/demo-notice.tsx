export function DemoNotice() {
  if (process.env.DEMO_MODE !== "true" || process.env.DEMO_MEDIA_STORAGE !== "ephemeral") return null;
  return <aside aria-label="Lưu ý bản demo" className="mb-4 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
    Bản demo chỉ dùng dữ liệu giả. Tệp tải lên chỉ lưu tạm và có thể mất khi máy chủ khởi động lại. Dữ liệu học tập có thời hạn lưu trữ.
  </aside>;
}
