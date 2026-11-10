import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { listAuthorCourses } from "@/lib/content";
import { AuthorWorkspace } from "./workspace";

export default async function AuthorPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "author" && user.role !== "admin") redirect("/learn");
  const courses = await listAuthorCourses(user);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-4">
        <div>
          <p className="text-sm font-semibold text-sky-700">
            Hán ngữ biển · Xưởng nội dung
          </p>
          <h1 className="text-2xl font-bold">Soạn bài bằng bảng từ</h1>
        </div>
        <nav
          className="flex flex-wrap gap-4 text-sm font-semibold text-sky-800"
          aria-label="Điều hướng biên soạn"
        >
          <Link href="/learn">Về trang học</Link>
          <a href="/api/author/template" download>
            Tải CSV mẫu
          </a>
          {user.role === "admin" && (
            <Link href="/admin">Quản trị nâng cao</Link>
          )}
        </nav>
      </header>
      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        DỮ LIỆU MẪU CHƯA KIỂM DUYỆT. Nội dung phải được chuyên gia duyệt trước
        khi dùng chính thức. Tiếng Trung không thay thế IMO SMCP tiếng Anh trong
        liên lạc an toàn hàng hải.
      </aside>
      <AuthorWorkspace initialCourses={courses} role={user.role} />
    </main>
  );
}
