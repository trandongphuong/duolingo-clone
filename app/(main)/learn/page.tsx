import Link from "next/link";
import { redirect } from "next/navigation";
import { getCourseProgress, getUnits, getUserProgress } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export default async function LearnPage() {
  await requireUser();
  const [progress, courseProgress, units] = await Promise.all([
    getUserProgress(),
    getCourseProgress(),
    getUnits(),
  ]);
  if (!progress?.activeCourse || progress.activeCourse.status !== "published")
    redirect("/courses");
  const percentage = courseProgress.totalLessons
    ? Math.round(
        (courseProgress.completedLessons / courseProgress.totalLessons) * 100
      )
    : 0;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-800">
          Lộ trình của bạn
        </p>
        <h1 className="break-words text-2xl font-bold text-slate-900">
          {progress.activeCourse.title}
        </h1>
        <p className="text-slate-600">{progress.activeCourse.description}</p>
      </header>
      {progress.activeCourse.sampleUnreviewed && (
        <p
          role="note"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
        >
          DỮ LIỆU MẪU CHƯA KIỂM DUYỆT. Tiếng Trung không thay thế IMO SMCP tiếng
          Anh trong liên lạc an toàn hàng hải chính thức.
        </p>
      )}
      <section
        aria-label="Tiến độ khóa học"
        className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-5"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <p>
            {courseProgress.completedLessons}/{courseProgress.totalLessons} bài
            hoàn thành · {percentage}%
          </p>
          <p className="font-bold text-sky-900">{progress.points} điểm</p>
        </div>
        <progress
          className="h-3 w-full accent-sky-700"
          value={percentage}
          max={100}
          aria-label="Phần trăm khóa học hoàn thành"
        />
        {courseProgress.activeLesson ? (
          <Link
            href={`/lesson/${courseProgress.activeLesson.id}`}
            className="inline-block rounded-lg bg-sky-800 px-5 py-3 font-semibold text-white"
          >
            Tiếp tục: {courseProgress.activeLesson.title}
          </Link>
        ) : (
          <p className="font-semibold text-emerald-800">
            Bạn đã hoàn thành các bài đang xuất bản. Có thể luyện lại hoặc ôn
            tập.
          </p>
        )}
      </section>
      {units.map((unit) => (
        <section key={unit.id} className="space-y-3">
          <h2 className="break-words text-xl font-bold text-slate-800">
            {unit.title}
          </h2>
          <p className="text-slate-600">{unit.description}</p>
          <ol className="space-y-3">
            {unit.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/lesson/${lesson.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:border-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
                >
                  <span className="min-w-0 break-words font-semibold">
                    {lesson.title}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      v{lesson.version}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${lesson.completed ? "bg-emerald-50 text-emerald-800" : lesson.id === courseProgress.activeLessonId ? "bg-sky-100 text-sky-900" : "bg-slate-100 text-slate-600"}`}
                  >
                    {lesson.completed
                      ? "Đã hoàn thành · Luyện lại"
                      : lesson.id === courseProgress.activeLessonId
                        ? "Đang học"
                        : "Chưa học"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <div className="flex flex-wrap gap-4">
        <Link href="/courses" className="rounded py-3 text-sky-800 underline">
          Đổi khóa học
        </Link>
        <Link href="/review" className="rounded py-3 text-sky-800 underline">
          Ôn tập
        </Link>
        <Link href="/progress" className="rounded py-3 text-sky-800 underline">
          Xem tiến độ
        </Link>
      </div>
    </div>
  );
}
