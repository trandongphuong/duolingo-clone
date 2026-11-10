import Link from "next/link";
import {
  getAttemptSummary,
  getCourseProgress,
  getUserProgress,
} from "@/db/queries";
import { requireUser } from "@/lib/auth";

export default async function ProgressPage() {
  const user = await requireUser();
  const [progress, course, attempts] = await Promise.all([
    getUserProgress(),
    getCourseProgress(),
    getAttemptSummary(),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10">
      <h1 className="text-2xl font-bold text-slate-900">Tiến độ của bạn</h1>
      <p className="text-slate-600">
        {user.firstName} · Dữ liệu chỉ thuộc tài khoản đang đăng nhập.
      </p>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-sky-50 p-5">
          <dt>Điểm tích lũy</dt>
          <dd className="mt-2 text-3xl font-bold">{progress?.points ?? 0}</dd>
        </div>
        <div className="rounded-xl border p-5">
          <dt>Bài đã hoàn thành trong khóa</dt>
          <dd className="mt-2 text-3xl font-bold">
            {course.completedLessons}/{course.totalLessons}
          </dd>
        </div>
        <div className="rounded-xl border p-5">
          <dt>Lượt trả lời đúng/tổng</dt>
          <dd className="mt-2 text-3xl font-bold">
            {attempts.correct}/{attempts.total}
          </dd>
        </div>
      </dl>
      <p>Khóa hiện tại: {progress?.activeCourse?.title ?? "Chưa chọn khóa"}</p>
      <p className="text-sm text-slate-600">
        Mỗi câu hoàn thành lần đầu được 10 điểm. Bản ghi câu trả lời và tiến độ
        được lưu trên máy chủ LAN; học lại không tăng điểm lặp.
      </p>
      <div className="flex gap-4">
        <Link
          href="/learn"
          className="rounded-lg bg-sky-800 px-5 py-3 text-white"
        >
          Tiếp tục học
        </Link>
        <Link href="/review" className="rounded py-3 text-sky-800 underline">
          Ôn tập
        </Link>
      </div>
    </div>
  );
}
