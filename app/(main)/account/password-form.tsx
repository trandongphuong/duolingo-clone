"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export const PasswordForm = () => {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <section className="max-w-lg rounded-2xl border p-5">
      <h2 className="text-xl font-bold">Đổi mật khẩu</h2>
      <p className="mt-2 text-sm text-slate-600">
        Ít nhất 12 ký tự, tối đa 72 byte UTF-8. Các phiên hiện có sẽ đăng xuất.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setMessage("");
          const form = event.currentTarget;
          const data = new FormData(form);
          try {
            const response = await fetch("/api/users/me/password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                currentPassword: data.get("currentPassword"),
                newPassword: data.get("newPassword"),
              }),
            });
            const result = await response.json();
            setMessage(result.error ?? result.message);
            if (response.ok) {
              form.reset();
              router.push("/sign-in");
              router.refresh();
            }
          } catch {
            setMessage("Không thể kết nối máy chủ.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="block space-y-2">
          <span>Mật khẩu hiện tại</span>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            className="block w-full rounded-lg border-2 px-3 py-2"
          />
        </label>
        <label className="block space-y-2">
          <span>Mật khẩu mới</span>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            className="block w-full rounded-lg border-2 px-3 py-2"
          />
        </label>
        <Button variant="primary" disabled={pending}>
          {pending ? "Đang lưu…" : "Đổi mật khẩu"}
        </Button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
    </section>
  );
};
