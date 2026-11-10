"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type Account = {
  id: string;
  username: string;
  displayName: string;
  role: "learner" | "author" | "admin";
  active: boolean;
  points: number;
  completedLessons: number;
  courseTitle: string | null;
};
const roleLabels = {
  learner: "Học viên",
  author: "Biên soạn viên",
  admin: "Quản trị viên",
};

export const UserManager = ({ currentUserId }: { currentUserId: string }) => {
  const router = useRouter();
  const [users, setUsers] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const load = async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setUsers(result);
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/users", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result as Account[];
      })
      .then(setUsers)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("Không thể tải danh sách tài khoản.");
        }
      });
    return () => controller.abort();
  }, []);
  const mutate = async (url: string, method: string, body: unknown) => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Đã lưu tài khoản.");
      if (
        method === "PATCH" &&
        result.id === currentUserId &&
        (result.role !== "admin" ||
          (body as { action?: string }).action === "resetPassword")
      ) {
        router.push("/sign-in");
        router.refresh();
        return true;
      }
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu.");
      return false;
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Quản trị tài khoản</h2>
        <p className="mt-2 text-sm text-slate-600">
          Chỉ tạo tài khoản được phép sử dụng. Không cần email hoặc số điện
          thoại.
        </p>
      </div>
      <form
        className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          if (await mutate("/api/users", "POST", Object.fromEntries(data)))
            form.reset();
        }}
      >
        <label className="space-y-2">
          <span>Tên đăng nhập mới</span>
          <input
            name="username"
            required
            minLength={3}
            maxLength={64}
            autoComplete="off"
            className="block w-full rounded-lg border-2 px-3 py-2"
          />
        </label>
        <label className="space-y-2">
          <span>Tên hiển thị</span>
          <input
            name="displayName"
            required
            maxLength={100}
            className="block w-full rounded-lg border-2 px-3 py-2"
          />
        </label>
        <label className="space-y-2">
          <span>Mật khẩu cấp phát</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            className="block w-full rounded-lg border-2 px-3 py-2"
          />
        </label>
        <label className="space-y-2">
          <span>Vai trò</span>
          <select
            name="role"
            defaultValue="learner"
            className="block w-full rounded-lg border-2 px-3 py-2"
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" disabled={pending}>
          Tạo tài khoản
        </Button>
      </form>
      {message && (
        <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="grid gap-4">
        {users.map((user) => (
          <article key={user.id} className="space-y-4 rounded-2xl border p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="font-bold">
                  {user.displayName} · {user.username}
                </h3>
                <p className="text-sm">
                  {roleLabels[user.role]} ·{" "}
                  {user.active ? "Đang hoạt động" : "Đã khóa"}
                </p>
              </div>
              <p className="text-sm">
                {user.points} điểm · {user.completedLessons} bài hoàn thành
                <br />
                {user.courseTitle ?? "Chưa chọn khóa"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Đổi vai trò</span>
                <select
                  aria-label={`Vai trò của ${user.username}`}
                  value={user.role}
                  disabled={pending}
                  onChange={(event) => {
                    void mutate(`/api/users/${user.id}`, "PATCH", {
                      action: "update",
                      role: event.target.value,
                    });
                  }}
                  className="rounded-lg border-2 px-2 py-2"
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="default"
                size="sm"
                disabled={pending || user.id === currentUserId}
                onClick={() => {
                  void mutate(`/api/users/${user.id}`, "PATCH", {
                    action: "update",
                    active: !user.active,
                  });
                }}
              >
                {user.active ? "Khóa tài khoản" : "Mở tài khoản"}
              </Button>
            </div>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                if (
                  await mutate(`/api/users/${user.id}`, "PATCH", {
                    action: "resetPassword",
                    password: data.get("password"),
                  })
                )
                  form.reset();
              }}
            >
              <label className="min-w-0 flex-1 space-y-2">
                <span className="text-sm">
                  Mật khẩu cấp lại cho {user.username}
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={72}
                  className="block w-full rounded-lg border-2 px-3 py-2"
                />
              </label>
              <Button variant="default" size="sm" disabled={pending}>
                Cấp lại mật khẩu
              </Button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
};
