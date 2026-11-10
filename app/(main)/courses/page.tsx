import { getCourses, getUserProgress } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { List } from "./list";

export default async function CoursesPage() {
  await requireUser();
  const [courses, progress] = await Promise.all([
    getCourses(),
    getUserProgress(),
  ]);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 pb-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">
        Khóa học tiếng Trung
      </h1>
      <p className="text-slate-600">
        Chọn khóa học để bắt đầu. Chỉ nội dung đã xuất bản được hiển thị.
      </p>
      {!courses.length && (
        <p className="rounded-xl border p-5">
          Chưa có khóa học được xuất bản. Vui lòng liên hệ quản trị viên.
        </p>
      )}
      <List courses={courses} activeCourseId={progress?.activeCourseId} />
    </div>
  );
}
