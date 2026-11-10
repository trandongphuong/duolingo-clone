"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { GeneratedExercise } from "@/lib/generate-exercises";
import type { ImportIssue, VocabularyRow } from "@/lib/import-vocabulary";

type LessonSummary = {
  id: number;
  title: string;
  code: string;
  status: string;
  version: number;
  description: string;
};
type AuthorCourse = {
  id: number;
  title: string;
  units: Array<{ id: number; title: string; lessons: LessonSummary[] }>;
};
type Preview = {
  rows: VocabularyRow[];
  issues: ImportIssue[];
  warnings: ImportIssue[];
  generationWarnings: string[];
  examples: GeneratedExercise[];
  receipt: string | null;
};
const fieldClass =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-slate-100";
const statusLabel: Record<string, string> = {
  draft: "Bản nháp",
  review: "Chờ duyệt",
  published: "Đã xuất bản",
  archived: "Phiên bản cũ",
};
const blankRow = (order: number, code = "L01"): VocabularyRow => ({
  lesson_code: code,
  order,
  hanzi: "",
  pinyin: "",
  meaning_vi: "",
  example_zh: "",
  example_pinyin: "",
  example_vi: "",
  audio_file: "",
  tags: "",
});

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Yêu cầu không thành công.");
  return data;
}
const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function AuthorWorkspace({
  initialCourses,
  role,
}: {
  initialCourses: AuthorCourse[];
  role: string;
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [selectedLesson, setSelectedLesson] = useState<LessonSummary | null>(
    null
  );
  const [courseId, setCourseId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [rows, setRows] = useState<VocabularyRow[]>([]);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("update");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newForm, setNewForm] = useState(initialCourses.length === 0);
  const editable = selectedLesson?.status === "draft";

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Thao tác không thành công."
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshCourses() {
    setCourses(await api<AuthorCourse[]>("/api/author/courses"));
  }
  async function loadLesson(id: number) {
    const data = await api<{ lesson: LessonSummary; rows: VocabularyRow[] }>(
      `/api/author/lessons?lessonId=${id}`
    );
    setSelectedLesson(data.lesson);
    setRows(data.rows);
    setPreview(null);
    setPaste("");
    setFilter("");
    setDirty(false);
  }
  function updateRow(
    index: number,
    key: keyof VocabularyRow,
    value: string | number
  ) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
    setPreview(null);
    setDirty(true);
  }
  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const result = await api<{ lessonId: number }>(
        "/api/author/courses",
        jsonPost({
          ...(courseId
            ? { courseId: Number(courseId) }
            : { courseTitle: form.get("courseTitle"), slug: form.get("slug") }),
          ...(unitId ? { unitId: Number(unitId) } : {}),
          description: form.get("description") || "",
          unitTitle: form.get("unitTitle") || "Chủ đề",
          lessonTitle: form.get("lessonTitle"),
          lessonCode: form.get("lessonCode"),
          lessonDescription: form.get("lessonDescription") || "",
          order: Number(form.get("order")) || 1,
        })
      );
      await refreshCourses();
      await loadLesson(result.lessonId);
      setNewForm(false);
      setMessage("Đã tạo bản nháp. Dán bảng hoặc nhập tệp để thêm từ.");
    });
  }
  async function showPreview(input: unknown) {
    if (!selectedLesson) return;
    const result = await api<Preview>(
      "/api/author/preview",
      jsonPost({ lessonId: selectedLesson.id, ...(input as object) })
    );
    setRows(result.rows);
    setPreview(result);
    setDirty(true);
    setMessage(
      `Đã xem trước ${result.rows.length} dòng; ${result.issues.length} lỗi cần sửa.`
    );
  }
  async function filePreview(file?: File) {
    if (!file || !selectedLesson) return;
    if (file.size > 5 * 1024 * 1024) throw new Error("Tệp vượt giới hạn 5 MB.");
    const form = new FormData();
    form.set("file", file);
    form.set("lessonId", String(selectedLesson.id));
    const result = await api<Preview>("/api/author/preview", {
      method: "POST",
      body: form,
    });
    setRows(result.rows);
    setPreview(result);
    setDirty(true);
    setMessage(`Đã xem trước ${result.rows.length} dòng từ ${file.name}.`);
  }
  async function save() {
    if (!selectedLesson || !preview?.receipt) return;
    const result = await api<{
      inserted: number;
      updated: number;
      skipped: number;
      questions: number;
    }>(
      "/api/author/save",
      jsonPost({
        lessonId: selectedLesson.id,
        rows,
        mode,
        receipt: preview.receipt,
        replace: mode === "update",
      })
    );
    await loadLesson(selectedLesson.id);
    setMessage(
      `Đã lưu: ${result.inserted} mục mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua; ${result.questions} câu hỏi tự sinh.`
    );
  }
  async function transition(action: "submit" | "publish" | "return" | "clone") {
    if (!selectedLesson) return;
    const result = await api<{ lessonId: number; status: string }>(
      "/api/author/transition",
      jsonPost({ lessonId: selectedLesson.id, action })
    );
    await refreshCourses();
    await loadLesson(result.lessonId);
    setMessage(`Trạng thái: ${statusLabel[result.status] || result.status}.`);
  }
  async function uploadAudio(index: number, file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error("Âm thanh vượt 5 MB.");
    const form = new FormData();
    form.set("file", file);
    const media = await api<{ path: string }>("/api/media", {
      method: "POST",
      body: form,
    });
    updateRow(index, "audio_file", media.path);
    setMessage(
      "Đã tải âm thanh nội bộ. Cần xem trước và lưu bảng để gắn vào bài."
    );
  }
  function moveRow(index: number, delta: number) {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((row, i) => ({ ...row, order: i + 1 }));
    });
    setPreview(null);
    setDirty(true);
  }
  const selectedCourse = courses.find(
    (course) => course.id === Number(courseId)
  );
  const allLessons = courses.flatMap((course) =>
    course.units.flatMap((unit) =>
      unit.lessons.map((lesson) => ({
        ...lesson,
        context: `${course.title} / ${unit.title}`,
      }))
    )
  );
  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 md:grid-cols-[1fr_auto]">
        <label className="space-y-1 text-sm font-semibold">
          Chọn bài để biên soạn hoặc duyệt
          <select
            className={fieldClass}
            value={selectedLesson?.id || ""}
            disabled={busy}
            onChange={(event) => {
              const id = Number(event.target.value);
              if (id) void run(() => loadLesson(id));
            }}
          >
            <option value="">— Chọn bài học —</option>
            {allLessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.context} / {lesson.title} · v{lesson.version} ·{" "}
                {statusLabel[lesson.status]}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          className="self-end"
          disabled={busy}
          onClick={() => setNewForm((current) => !current)}
        >
          {newForm ? "Đóng biểu mẫu" : "Tạo khóa / thêm bài"}
        </Button>
      </section>

      {newForm && (
        <form
          className="space-y-4 rounded-2xl border border-slate-200 p-4"
          onSubmit={createLesson}
        >
          <h2 className="text-xl font-bold">1. Khóa học → Chủ đề → Bài học</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold">
              Khóa học
              <select
                className={fieldClass}
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setUnitId("");
                }}
              >
                <option value="">Tạo khóa mới</option>
                {courses.map((course) => (
                  <option value={course.id} key={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            {courseId && (
              <label className="space-y-1 text-sm font-semibold">
                Chủ đề
                <select
                  className={fieldClass}
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                >
                  <option value="">Tạo chủ đề mới</option>
                  {selectedCourse?.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!courseId && (
              <>
                <label className="space-y-1 text-sm font-semibold">
                  Tên khóa
                  <input
                    name="courseTitle"
                    className={fieldClass}
                    required
                    maxLength={150}
                    placeholder="Hán ngữ cơ bản"
                  />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  Mã khóa
                  <input
                    name="slug"
                    className={fieldClass}
                    required
                    maxLength={80}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="han-ngu-co-ban"
                  />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  Mô tả khóa
                  <textarea
                    name="description"
                    className={fieldClass}
                    maxLength={2000}
                  />
                </label>
              </>
            )}
            {!unitId && (
              <label className="space-y-1 text-sm font-semibold">
                Tên chủ đề
                <input
                  name="unitTitle"
                  className={fieldClass}
                  required
                  maxLength={150}
                  placeholder="Chào hỏi"
                />
              </label>
            )}
            <label className="space-y-1 text-sm font-semibold">
              Tên bài
              <input
                name="lessonTitle"
                className={fieldClass}
                required
                maxLength={150}
                placeholder="Bài 1: Xin chào"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              Mã bài
              <input
                name="lessonCode"
                className={fieldClass}
                defaultValue="L01"
                required
                maxLength={40}
                pattern="[a-zA-Z0-9_-]+"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              Thứ tự bài
              <input
                name="order"
                className={fieldClass}
                type="number"
                min={1}
                max={10000}
                defaultValue={1}
                required
              />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              Mô tả bài
              <textarea
                name="lessonDescription"
                className={fieldClass}
                maxLength={2000}
              />
            </label>
          </div>
          <Button variant="primary" disabled={busy}>
            Tạo bản nháp và nhập từ
          </Button>
        </form>
      )}

      <div
        aria-live="polite"
        role="status"
        className={
          message ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" : ""
        }
      >
        {message}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </div>
      )}

      {selectedLesson && (
        <>
          <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">2. {selectedLesson.title}</h2>
                <p className="text-sm text-slate-600">
                  {selectedLesson.code} · Phiên bản {selectedLesson.version} ·{" "}
                  {statusLabel[selectedLesson.status]}
                </p>
              </div>
              <a
                href={`/api/author/export?lessonId=${selectedLesson.id}`}
                className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800"
              >
                Xuất CSV
              </a>
            </div>
            {!editable && (
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Bài đã gửi duyệt hoặc xuất bản được khóa chỉnh sửa. Bản nháp
                phiên bản mới giữ nguyên lịch sử học của phiên bản cũ.
              </p>
            )}
            {editable && (
              <>
                <label className="block space-y-1 text-sm font-semibold">
                  Dán bảng từ Excel (Hanzi, Pinyin, nghĩa Việt) hoặc CSV có tên
                  cột
                  <textarea
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                    className={`${fieldClass} min-h-32 font-mono`}
                    placeholder={"你好\tnǐ hǎo\tXin chào\n谢谢\txièxie\tCảm ơn"}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    disabled={busy || !paste.trim()}
                    onClick={() => void run(() => showPreview({ text: paste }))}
                  >
                    Xem trước bảng dán
                  </Button>
                  <label className="flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-2 text-sm">
                    Nhập CSV / XLSX
                    <input
                      aria-label="Chọn tệp từ vựng CSV hoặc XLSX"
                      className="max-w-[220px] text-xs"
                      type="file"
                      accept=".csv,.xlsx"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void run(() => filePreview(file));
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-600">
                  Tối đa 2.000 dòng, 5 MB. Không nhận macro/công thức. Bảng đang
                  xem trước chưa ghi vào cơ sở dữ liệu. Hãy lưu bảng hiện tại
                  trước khi nhập bảng khác.
                </p>
              </>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                3. Bảng từ vựng · {rows.length} mục
              </h2>
              <label className="text-sm">
                <span className="sr-only">Tìm trong bảng từ</span>
                <input
                  className={fieldClass}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Tìm Hanzi, nghĩa hoặc nhãn…"
                />
              </label>
            </div>
            <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Bảng từ vựng chỉnh trực tiếp. Mở Chi tiết để sửa ví dụ, nhãn
                  và âm thanh.
                </caption>
                <thead className="bg-sky-50">
                  <tr>
                    {[
                      "#",
                      "Hanzi",
                      "Pinyin",
                      "Nghĩa tiếng Việt",
                      "Chi tiết / âm thanh",
                      "Sắp xếp",
                    ].map((title) => (
                      <th key={title} className="p-2">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .map((row, index) => ({ row, index }))
                    .filter(({ row }) =>
                      [row.hanzi, row.pinyin, row.meaning_vi, row.tags].some(
                        (value) =>
                          value
                            .toLocaleLowerCase("vi")
                            .includes(filter.toLocaleLowerCase("vi"))
                      )
                    )
                    .map(({ row, index }) => (
                      <tr
                        key={index}
                        className="border-t border-slate-200 align-top"
                      >
                        <td className="w-16 p-2">
                          <input
                            aria-label={`Thứ tự dòng ${index + 1}`}
                            type="number"
                            min={1}
                            max={2000}
                            className={`${fieldClass} px-1`}
                            value={Number.isFinite(row.order) ? row.order : ""}
                            disabled={!editable || busy}
                            onChange={(event) =>
                              updateRow(
                                index,
                                "order",
                                Number(event.target.value)
                              )
                            }
                          />
                        </td>
                        <td className="w-32 p-2">
                          <input
                            lang="zh-Hans"
                            aria-label={`Hanzi dòng ${index + 1}`}
                            className={`${fieldClass} text-lg`}
                            value={row.hanzi}
                            maxLength={500}
                            disabled={!editable || busy}
                            onChange={(event) =>
                              updateRow(index, "hanzi", event.target.value)
                            }
                          />
                        </td>
                        <td className="w-36 p-2">
                          <input
                            aria-label={`Pinyin dòng ${index + 1}`}
                            className={fieldClass}
                            value={row.pinyin}
                            maxLength={500}
                            disabled={!editable || busy}
                            onChange={(event) =>
                              updateRow(index, "pinyin", event.target.value)
                            }
                          />
                        </td>
                        <td className="min-w-40 p-2">
                          <input
                            aria-label={`Nghĩa dòng ${index + 1}`}
                            className={fieldClass}
                            value={row.meaning_vi}
                            maxLength={500}
                            disabled={!editable || busy}
                            onChange={(event) =>
                              updateRow(index, "meaning_vi", event.target.value)
                            }
                          />
                        </td>
                        <td className="w-64 p-2">
                          <details>
                            <summary className="cursor-pointer rounded px-2 py-3 text-sky-800 focus-visible:outline">
                              Ví dụ, nhãn, âm thanh
                            </summary>
                            <div className="w-56 space-y-2 py-2">
                              {(
                                [
                                  ["example_zh", "Ví dụ chữ Hán"],
                                  ["example_pinyin", "Pinyin ví dụ"],
                                  ["example_vi", "Nghĩa ví dụ"],
                                  ["tags", "Nhãn (dấu ;)"],
                                  ["audio_file", "Đường dẫn âm thanh local"],
                                ] as const
                              ).map(([key, label]) => (
                                <label key={key} className="block text-xs">
                                  {label}
                                  <input
                                    className={fieldClass}
                                    value={row[key]}
                                    disabled={!editable || busy}
                                    maxLength={
                                      key.startsWith("example_") ? 2000 : 500
                                    }
                                    onChange={(event) =>
                                      updateRow(index, key, event.target.value)
                                    }
                                  />
                                </label>
                              ))}
                              {editable && (
                                <label className="block text-xs">
                                  Tải âm thanh nội bộ
                                  <input
                                    aria-label={`Tải âm thanh dòng ${index + 1}`}
                                    type="file"
                                    className="mt-1 w-full text-xs"
                                    accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                                    disabled={busy}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.target.value = "";
                                      void run(() => uploadAudio(index, file));
                                    }}
                                  />
                                </label>
                              )}
                              {row.audio_file &&
                              /^\/(?:api\/media\/[0-9a-f-]{36}|[a-zA-Z0-9_./-]+\.(?:mp3|wav|ogg))$/.test(
                                row.audio_file
                              ) &&
                              !row.audio_file.includes("..") ? (
                                <audio
                                  controls
                                  preload="none"
                                  src={row.audio_file}
                                  aria-label={`Nghe ${row.hanzi}`}
                                  className="max-w-full"
                                />
                              ) : (
                                <p className="text-xs text-slate-500">
                                  Chưa có âm thanh đã thẩm định.
                                </p>
                              )}
                            </div>
                          </details>
                        </td>
                        <td className="w-28 p-2">
                          {editable && (
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                className="min-h-11 rounded border px-3"
                                aria-label={`Chuyển dòng ${index + 1} lên`}
                                disabled={busy || index === 0}
                                onClick={() => moveRow(index, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="min-h-11 rounded border px-3"
                                aria-label={`Chuyển dòng ${index + 1} xuống`}
                                disabled={busy || index === rows.length - 1}
                                onClick={() => moveRow(index, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="min-h-11 rounded border px-3 text-red-800"
                                aria-label={`Xóa dòng ${index + 1} khỏi bản nháp`}
                                disabled={busy}
                                onClick={() => {
                                  setRows((current) =>
                                    current
                                      .filter((_, i) => i !== index)
                                      .map((value, i) => ({
                                        ...value,
                                        order: i + 1,
                                      }))
                                  );
                                  setPreview(null);
                                  setDirty(true);
                                }}
                              >
                                Xóa
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="text-sm text-slate-600">
                Chưa có từ. Dán bảng 10 dòng hoặc tải tệp để bắt đầu.
              </p>
            )}
            {editable && (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={busy || rows.length >= 2000}
                  onClick={() => {
                    setRows((current) => [
                      ...current,
                      blankRow(current.length + 1, selectedLesson.code),
                    ]);
                    setPreview(null);
                    setDirty(true);
                  }}
                >
                  Thêm từng dòng
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy || !rows.length}
                  onClick={() => void run(() => showPreview({ rows }))}
                >
                  Kiểm tra / Xem trước
                </Button>
              </div>
            )}
          </section>

          {preview && (
            <section className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <h2 className="text-xl font-bold">4. Kiểm tra trước khi lưu</h2>
              {preview.issues.length > 0 && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-900"
                >
                  <p className="font-bold">
                    Còn {preview.issues.length} lỗi. Sửa trực tiếp bảng trên rồi
                    kiểm tra lại.
                  </p>
                  <ul className="mt-2 list-inside list-disc">
                    {preview.issues.slice(0, 30).map((issue, i) => (
                      <li key={i}>
                        Dòng {issue.row}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(preview.warnings.length > 0 ||
                preview.generationWarnings.length > 0) && (
                <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">
                    Cảnh báo (
                    {preview.warnings.length +
                      preview.generationWarnings.length}
                    )
                  </summary>
                  <ul className="mt-2 list-inside list-disc">
                    {preview.warnings.slice(0, 10).map((issue, i) => (
                      <li key={i}>
                        Dòng {issue.row}: {issue.message}
                      </li>
                    ))}
                    {preview.generationWarnings
                      .slice(0, 10)
                      .map((warning, i) => (
                        <li key={`g${i}`}>{warning}</li>
                      ))}
                  </ul>
                </details>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {preview.examples.map((exercise) => (
                  <div
                    key={exercise.sourceKey}
                    className="rounded-xl border bg-white p-3"
                  >
                    <p className="text-xs font-semibold uppercase text-sky-800">
                      {exercise.type === "SELECT"
                        ? "Chọn nghĩa"
                        : "Chọn chữ Hán"}{" "}
                      · xem trước tác giả
                    </p>
                    <p className="my-2 text-lg font-bold">
                      {exercise.question}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {exercise.options.map((option) => (
                        <li
                          key={option.text}
                          className={
                            option.correct
                              ? "font-bold text-emerald-800"
                              : "text-slate-600"
                          }
                        >
                          {option.correct ? "✓ " : "○ "}
                          {option.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {editable && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1 text-sm font-semibold">
                    Khi đã có mục trùng
                    <select
                      className={fieldClass}
                      value={mode}
                      onChange={(event) =>
                        setMode(event.target.value as "skip" | "update")
                      }
                    >
                      <option value="update">
                        Cập nhật bản nháp theo toàn bộ bảng này
                      </option>
                      <option value="skip">
                        Bỏ qua mục trùng, thêm mục mới
                      </option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={
                      busy || !preview.receipt || preview.issues.length > 0
                    }
                    onClick={() => void run(save)}
                  >
                    Xác nhận lưu bản nháp
                  </Button>
                </div>
              )}
            </section>
          )}

          <section
            className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 p-4"
            aria-label="Trạng thái xuất bản"
          >
            {selectedLesson.status === "draft" && (
              <Button
                type="button"
                disabled={busy || dirty}
                onClick={() => void run(() => transition("submit"))}
              >
                Gửi duyệt
              </Button>
            )}
            {role === "admin" &&
              ["draft", "review"].includes(selectedLesson.status) && (
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy || dirty}
                  onClick={() => void run(() => transition("publish"))}
                >
                  Xuất bản
                </Button>
              )}
            {role === "admin" && selectedLesson.status === "review" && (
              <Button
                type="button"
                disabled={busy || dirty}
                onClick={() => void run(() => transition("return"))}
              >
                Trả về bản nháp
              </Button>
            )}
            {["published", "archived"].includes(selectedLesson.status) && (
              <Button
                type="button"
                disabled={busy || dirty}
                onClick={() => void run(() => transition("clone"))}
              >
                Tạo phiên bản nháp mới
              </Button>
            )}
            <p className="self-center text-xs text-slate-600">
              {dirty
                ? "Bảng có thay đổi chưa lưu. Hãy kiểm tra và xác nhận lưu trước khi chuyển trạng thái."
                : "Chỉ quản trị viên được xuất bản. Phiên bản đã học luôn giữ lịch sử."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
