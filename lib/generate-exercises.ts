import { createHash } from "node:crypto";

export type ExerciseEntry = {
  id: number;
  sourceKey: string;
  hanzi: string;
  pinyin: string;
  meaningVi: string;
};

export type GeneratedExercise = {
  sourceKey: string;
  type: "SELECT" | "ASSIST";
  question: string;
  vocabularyId: number;
  order: number;
  options: Array<{ text: string; correct: boolean }>;
};

const normalize = (value: string) =>
  value.normalize("NFC").trim().toLocaleLowerCase("vi");
const rank = (seed: string) => createHash("sha256").update(seed).digest("hex");

export function vocabularySourceKey(hanzi: string) {
  return rank(normalize(hanzi)).slice(0, 24);
}

/** Generate only choices present in the vocabulary. Synonyms are never used as wrong answers. */
export function generateExercises(entries: ExerciseEntry[]): {
  exercises: GeneratedExercise[];
  warnings: string[];
} {
  const exercises: GeneratedExercise[] = [];
  const warnings: string[] = [];
  for (const entry of entries) {
    for (const type of ["SELECT", "ASSIST"] as const) {
      const label = (item: ExerciseEntry) =>
        type === "SELECT" ? item.meaningVi : item.hanzi;
      const answer = label(entry);
      const seen = new Set([normalize(answer)]);
      const candidates = entries
        .filter(
          (other) =>
            normalize(other.hanzi) !== normalize(entry.hanzi) &&
            normalize(other.meaningVi) !== normalize(entry.meaningVi)
        )
        .sort((a, b) =>
          rank(`${entry.sourceKey}:${type}:${a.sourceKey}`).localeCompare(
            rank(`${entry.sourceKey}:${type}:${b.sourceKey}`)
          )
        );
      const options = [{ text: answer, correct: true }];
      for (const candidate of candidates) {
        const text = label(candidate);
        if (!seen.has(normalize(text))) {
          seen.add(normalize(text));
          options.push({ text, correct: false });
        }
        if (options.length === 4) break;
      }
      if (options.length < 2) {
        warnings.push(
          `${entry.hanzi}: chưa đủ phương án phân biệt để tạo câu ${type === "SELECT" ? "chọn nghĩa" : "chọn chữ"}.`
        );
        continue;
      }
      if (options.length < 4)
        warnings.push(
          `${entry.hanzi}: câu hỏi có ${options.length} lựa chọn hợp lệ.`
        );
      options.sort((a, b) =>
        rank(`${entry.sourceKey}:${type}:${a.text}`).localeCompare(
          rank(`${entry.sourceKey}:${type}:${b.text}`)
        )
      );
      exercises.push({
        sourceKey: `${entry.sourceKey}:${type}`,
        type,
        question:
          type === "SELECT"
            ? `${entry.hanzi} · ${entry.pinyin}`
            : entry.meaningVi,
        vocabularyId: entry.id,
        order: exercises.length + 1,
        options,
      });
    }
  }
  return { exercises, warnings };
}
