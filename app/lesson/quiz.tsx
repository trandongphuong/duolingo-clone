"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";

import {
  markVocabularyForReview,
  upsertChallengeProgress,
} from "@/actions/challenge-progress";
import type { LearnerLesson } from "@/db/queries";

export function Quiz({
  lesson: initialLesson,
  reviewMode = false,
}: {
  lesson: LearnerLesson;
  reviewMode?: boolean;
}) {
  // Revalidation may refresh the server payload after each answer; keep this round stable.
  const [lesson] = useState(initialLesson);
  const [repeat, setRepeat] = useState(false);
  const remaining = lesson.challenges.filter((item) => !item.completed);
  const practice = repeat || remaining.length === 0;
  const questions = practice || reviewMode ? lesson.challenges : remaining;
  const [phase, setPhase] = useState<"cards" | "quiz" | "result">(
    lesson.vocabulary.length ? "cards" : "quiz"
  );
  const [cardIndex, setCardIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number>();
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [error, setError] = useState("");
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [earned, setEarned] = useState(0);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const word = lesson.vocabulary[cardIndex];
  const question = questions[questionIndex];
  const completedBefore =
    practice || reviewMode ? 0 : lesson.challenges.length - remaining.length;
  const completedNow = Math.min(
    lesson.challenges.length,
    completedBefore + questionIndex + (feedback === "correct" ? 1 : 0)
  );
  const percentage = lesson.challenges.length
    ? Math.round((completedNow / lesson.challenges.length) * 100)
    : 0;

  function checkAnswer() {
    if (!selected || !question || inFlight.current || feedback) return;
    inFlight.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await upsertChallengeProgress(question.id, selected);
        setFeedback(result.correct ? "correct" : "wrong");
        setEarned((value) => value + result.awardedPoints);
        if (result.correct) setCorrect((value) => value + 1);
        else setWrong((value) => value + 1);
      } catch {
        setError(
          "Chưa lưu được câu trả lời. Vui lòng thử lại; điểm chỉ ghi khi máy chủ xác nhận."
        );
      } finally {
        inFlight.current = false;
      }
    });
  }

  function continueQuiz() {
    if (feedback === "wrong") {
      setFeedback(null);
      setSelected(undefined);
      return;
    }
    if (questionIndex + 1 === questions.length) setPhase("result");
    else setQuestionIndex((value) => value + 1);
    setSelected(undefined);
    setFeedback(null);
  }

  function repeatLesson() {
    setRepeat(true);
    setPhase(lesson.vocabulary.length ? "cards" : "quiz");
    setCardIndex(0);
    setQuestionIndex(0);
    setSelected(undefined);
    setFeedback(null);
    setCorrect(0);
    setWrong(0);
    setEarned(0);
    setError("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Link
          href="/learn"
          className="rounded px-2 py-2 text-sky-800 underline focus-visible:outline focus-visible:outline-2"
        >
          ← Lộ trình học
        </Link>
        <p className="text-sm text-slate-600">
          Phiên bản {lesson.version}
          {practice ? " · Luyện lại không cộng điểm" : ""}
        </p>
      </header>
      <h1 className="break-words text-2xl font-bold text-slate-900">
        {lesson.title}
      </h1>
      {lesson.sampleUnreviewed && (
        <p
          role="note"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
        >
          DỮ LIỆU MẪU CHƯA KIỂM DUYỆT. Không thay thế IMO SMCP tiếng Anh trong
          liên lạc an toàn hàng hải chính thức.
        </p>
      )}
      {phase === "cards" && word && (
        <section aria-label="Thẻ từ vựng" className="space-y-6">
          <p className="text-sm text-slate-600">
            Thẻ {cardIndex + 1}/{lesson.vocabulary.length} · Học chữ Hán, Pinyin
            và nghĩa
          </p>
          <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-6 text-center sm:p-10">
            <p
              lang="zh-Hans"
              className="break-words text-5xl leading-relaxed text-slate-950"
            >
              {word.hanzi}
            </p>
            <p lang="zh-Latn-pinyin" className="text-2xl text-sky-900">
              {word.pinyin}
            </p>
            <p className="text-xl font-semibold text-slate-800">
              {word.meaningVi}
            </p>
            {word.exampleZh && (
              <div className="space-y-2 border-t border-sky-200 pt-4">
                <p lang="zh-Hans">{word.exampleZh}</p>
                <p>{word.examplePinyin}</p>
                <p>{word.exampleVi}</p>
              </div>
            )}
            {word.audioPath ? (
              <div className="space-y-2">
                <audio
                  controls
                  preload="none"
                  src={word.audioPath}
                  className="mx-auto w-full max-w-sm"
                  aria-label={`Nghe: ${word.hanzi}`}
                />
                <p className="text-xs text-slate-600">
                  Nội dung chữ tương đương: {word.hanzi} — {word.pinyin} —{" "}
                  {word.meaningVi}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Chưa có âm thanh được kiểm duyệt cho mục từ này.
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              className="rounded-lg border px-5 py-3 disabled:opacity-40"
              disabled={cardIndex === 0}
              onClick={() => setCardIndex((value) => value - 1)}
            >
              Thẻ trước
            </button>
            <button
              type="button"
              className="rounded-lg bg-sky-800 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
              onClick={() =>
                cardIndex + 1 < lesson.vocabulary.length
                  ? setCardIndex((value) => value + 1)
                  : setPhase(questions.length ? "quiz" : "result")
              }
            >
              {cardIndex + 1 < lesson.vocabulary.length
                ? "Thẻ tiếp theo"
                : "Bắt đầu luyện tập"}
            </button>
          </div>
          <button
            type="button"
            className="rounded px-2 py-3 text-sm text-sky-800 underline"
            onClick={() => setPhase(questions.length ? "quiz" : "result")}
          >
            Đến phần trắc nghiệm
          </button>
        </section>
      )}
      {phase === "quiz" && question && (
        <section className="space-y-5" aria-label="Trắc nghiệm">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p>
              Câu {questionIndex + 1}/{questions.length}
            </p>
            <p>{percentage}% đã hoàn thành</p>
          </div>
          <progress
            max={100}
            value={percentage}
            aria-label="Tiến độ bài học"
            className="h-3 w-full accent-sky-700"
          />
          <h2 className="break-words text-xl font-semibold leading-relaxed sm:text-2xl">
            {question.type === "SELECT"
              ? "Chọn nghĩa tiếng Việt"
              : "Chọn chữ Hán"}
            :{" "}
            <span lang={question.type === "SELECT" ? "zh-Hans" : "vi"}>
              {question.question}
            </span>
          </h2>
          <div
            className="grid gap-3 sm:grid-cols-2"
            role="group"
            aria-label="Các phương án trả lời"
          >
            {question.challengeOptions.map((option, index) => (
              <button
                type="button"
                key={option.id}
                aria-pressed={selected === option.id}
                disabled={pending || feedback !== null}
                onClick={() => setSelected(option.id)}
                className={`min-h-20 break-words rounded-xl border-2 p-4 text-left text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${selected === option.id ? "border-sky-700 bg-sky-50" : "border-slate-200 bg-white hover:border-sky-400"}`}
              >
                <span className="mr-2 text-sm text-slate-500">
                  {index + 1}.
                </span>
                <span lang={question.type === "ASSIST" ? "zh-Hans" : "vi"}>
                  {option.text}
                </span>
              </button>
            ))}
          </div>
          <div aria-live="polite" className="min-h-8">
            {feedback === "correct" && (
              <p className="font-semibold text-emerald-800">
                Chính xác. Câu trả lời đã được máy chủ lưu.
              </p>
            )}
            {feedback === "wrong" && (
              <p className="font-semibold text-rose-800">
                Chưa đúng. Từ này đã được đưa vào danh sách cần ôn. Hãy thử lại.
              </p>
            )}
            {error && (
              <p role="alert" className="text-rose-800">
                {error}
              </p>
            )}
          </div>
          {feedback ? (
            <button
              type="button"
              onClick={continueQuiz}
              className="w-full rounded-lg bg-sky-800 px-5 py-3 font-semibold text-white"
            >
              {feedback === "wrong"
                ? "Thử lại câu này"
                : questionIndex + 1 === questions.length
                  ? "Xem kết quả"
                  : "Câu tiếp theo"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!selected || pending}
              onClick={checkAnswer}
              className="w-full rounded-lg bg-sky-800 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Đang lưu…" : "Kiểm tra đáp án"}
            </button>
          )}
        </section>
      )}
      {(phase === "result" || (phase === "quiz" && !question)) && (
        <section
          className="space-y-5 rounded-2xl border border-sky-200 bg-sky-50 p-6"
          aria-label="Kết quả bài học"
        >
          <h2 className="text-2xl font-bold">Bạn đã hoàn thành lượt học!</h2>
          <p>
            Câu đúng: <strong>{correct}</strong> / {correct + wrong} lượt trả
            lời trong lượt học này.
          </p>
          <p>
            Câu cần thử lại: <strong>{wrong}</strong>. Điểm mới:{" "}
            <strong>{earned}</strong>.
          </p>
          <p className="text-sm text-slate-700">
            Tiến độ được lưu theo tài khoản. Luyện lại câu đã hoàn thành không
            cộng thêm điểm.
          </p>
          {lesson.vocabulary.length > 0 && (
            <details className="rounded-lg border bg-white p-3">
              <summary className="cursor-pointer py-2 font-semibold">
                Đánh dấu từ chưa nhớ
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {lesson.vocabulary.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={pending}
                    className="rounded-lg border px-3 py-3"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await markVocabularyForReview(item.id);
                          setError(
                            `Đã thêm ${item.hanzi} vào danh sách cần ôn.`
                          );
                        } catch {
                          setError(
                            "Chưa đánh dấu được từ. Hãy hoàn thành trắc nghiệm của từ trước."
                          );
                        }
                      })
                    }
                  >
                    {item.hanzi} · Cần ôn
                  </button>
                ))}
              </div>
            </details>
          )}
          {error && (
            <p role="status" className="text-sky-900">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/learn"
              className="rounded-lg bg-sky-800 px-5 py-3 font-semibold text-white"
            >
              Tiếp tục học
            </Link>
            <Link
              href="/review"
              className="rounded-lg border border-sky-700 px-5 py-3 text-sky-900"
            >
              Ôn từ cần nhớ
            </Link>
            <button
              type="button"
              className="rounded-lg border px-5 py-3"
              onClick={repeatLesson}
            >
              Học lại bài này
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
