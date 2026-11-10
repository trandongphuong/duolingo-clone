import Link from "next/link";
import { startReviewLesson } from "@/actions/user-progress";
import { getDueReviews } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export default async function ReviewPage() {
  await requireUser();
  const reviews = await getDueReviews();
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10">
      <h1 className="text-2xl font-bold text-slate-900">Ôn tập từ cần nhớ</h1>
      <p className="text-slate-600">
        Trả lời đúng để giãn lịch ôn 1, 3, 7 rồi 14 ngày; trả lời sai đưa từ về
        danh sách cần ôn ngay. Luyện lại không cộng điểm lặp.
      </p>
      {!reviews.length && (
        <p className="rounded-xl border bg-sky-50 p-5">
          Hiện chưa có từ đến hạn. Tiếp tục học bài mới hoặc luyện lại trong lộ
          trình.
        </p>
      )}
      <ul className="space-y-4">
        {reviews.map((item) => (
          <li key={item.id} className="space-y-3 rounded-xl border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p lang="zh-Hans" className="text-3xl">
                {item.vocabulary.hanzi}
              </p>
              <p className="text-lg text-sky-900">{item.vocabulary.pinyin}</p>
            </div>
            <p>{item.vocabulary.meaningVi}</p>
            {item.vocabulary.audioPath && (
              <audio
                controls
                preload="none"
                src={item.vocabulary.audioPath}
                className="w-full"
                aria-label={`Nghe ${item.vocabulary.hanzi}`}
              />
            )}
            <form
              action={startReviewLesson.bind(null, item.vocabulary.lessonId)}
            >
              <button
                type="submit"
                className="inline-block rounded-lg bg-sky-800 px-4 py-3 font-semibold text-white"
              >
                Luyện trong bài: {item.lessonTitle}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Link
        href="/learn"
        className="inline-block rounded py-3 text-sky-800 underline"
      >
        Về lộ trình học
      </Link>
    </div>
  );
}
