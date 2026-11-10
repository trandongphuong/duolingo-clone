import assert from "node:assert/strict";
import test from "node:test";
import {
  generateExercises,
  vocabularySourceKey,
} from "../lib/generate-exercises";

const entries = [
  {
    id: 1,
    sourceKey: "hello",
    hanzi: "你好",
    pinyin: "nǐ hǎo",
    meaningVi: "Xin chào",
  },
  {
    id: 2,
    sourceKey: "thanks",
    hanzi: "谢谢",
    pinyin: "xièxie",
    meaningVi: "Cảm ơn",
  },
  {
    id: 3,
    sourceKey: "bye",
    hanzi: "再见",
    pinyin: "zàijiàn",
    meaningVi: "Tạm biệt",
  },
  { id: 4, sourceKey: "sea", hanzi: "海", pinyin: "hǎi", meaningVi: "Biển" },
];

test("two exercise directions with real distinct choices and exactly one answer", () => {
  const result = generateExercises(entries);
  assert.equal(result.exercises.length, 8);
  assert.deepEqual(result.warnings, []);
  for (const exercise of result.exercises) {
    assert.equal(exercise.options.filter((x) => x.correct).length, 1);
    assert.equal(new Set(exercise.options.map((x) => x.text)).size, 4);
    const target = entries.find((x) => x.id === exercise.vocabularyId)!;
    assert.equal(
      exercise.options.find((x) => x.correct)!.text,
      exercise.type === "SELECT" ? target.meaningVi : target.hanzi
    );
    assert.ok(
      exercise.options.every((x) =>
        entries.some(
          (e) => x.text === (exercise.type === "SELECT" ? e.meaningVi : e.hanzi)
        )
      )
    );
  }
});

test("generation is stable on repeated import and does not invent distractors", () => {
  assert.deepEqual(generateExercises(entries), generateExercises(entries));
  assert.equal(generateExercises(entries.slice(0, 1)).exercises.length, 0);
  const two = generateExercises(entries.slice(0, 2));
  assert.equal(two.exercises.length, 4);
  assert.ok(two.exercises.every((x) => x.options.length === 2));
  assert.equal(two.warnings.length, 4);
});

test("synonymous words are not incorrectly marked as wrong answers", () => {
  const synonyms = [
    entries[0],
    { ...entries[1], hanzi: "您好", meaningVi: "Xin chào" },
  ];
  assert.equal(generateExercises(synonyms).exercises.length, 0);
  assert.equal(vocabularySourceKey(" 你\u597d "), vocabularySourceKey("你好"));
});
