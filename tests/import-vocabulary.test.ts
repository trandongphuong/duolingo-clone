import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";

import {
  exportVocabularyCsv,
  isLocalAudioPath,
  MAX_IMPORT_BYTES,
  parseVocabularyFile,
  parseVocabularyText,
  validateVocabularyRows,
  type VocabularyRow,
} from "../lib/import-vocabulary";

const sample = (values: Partial<VocabularyRow> = {}): VocabularyRow => ({
  lesson_code: "L01", order: 1, hanzi: "你好", pinyin: "nǐ hǎo", meaning_vi: "Xin chào",
  example_zh: "你好！", example_pinyin: "Nǐ hǎo!", example_vi: "Xin chào!", audio_file: "", tags: "chao_hoi",
  ...values,
});

test("imports real UTF-8 sample with 10 Chinese/Pinyin/Vietnamese rows and BOM", async () => {
  const file = await readFile(new URL("../templates/vocabulary_sample.csv", import.meta.url));
  const result = await parseVocabularyFile(Buffer.concat([Buffer.from("\uFEFF"), file]), "sample.csv");
  assert.equal(result.issues.length, 0);
  assert.equal(result.rows.length, 10);
  assert.equal(result.rows[0].pinyin, "nǐ hǎo");
  assert.equal(result.rows[9].meaning_vi, "An toàn");
  assert.equal(result.warnings.length, 10);
});

test("supports pasted headerless TSV and assigns order", () => {
  const result = parseVocabularyText("你好\tnǐ hǎo\tXin chào\n谢谢\txièxie\tCảm ơn");
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.rows.map((row) => row.order), [1, 2]);
  assert.equal(result.rows[1].hanzi, "谢谢");
});

test("CSV parser preserves quoted commas, newline, quotes and Unicode", () => {
  const original = sample({ example_vi: 'Chào bạn, "người bạn"!\nChúc vui.' });
  const result = parseVocabularyText(exportVocabularyCsv([original]));
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.rows, [original]);
});

test("reports missing fields, repeated word/order and invalid order with row numbers", () => {
  const result = validateVocabularyRows([
    sample(),
    sample({ pinyin: "", order: 1 }),
    sample({ hanzi: "谢谢", order: -2 }),
  ]);
  assert.ok(result.issues.some((entry) => entry.row === 3 && entry.message.includes("pinyin")));
  assert.ok(result.issues.some((entry) => entry.row === 3 && entry.message.includes("Trùng Hanzi")));
  assert.ok(result.issues.some((entry) => entry.row === 3 && entry.message.includes("Trùng thứ tự")));
  assert.ok(result.issues.some((entry) => entry.row === 4 && entry.message.includes("order")));
});

test("same Hanzi in distinct lessons is not duplicate", () => {
  assert.equal(validateVocabularyRows([sample(), sample({ lesson_code: "L02" })]).issues.length, 0);
});

test("normalizes Unicode before identifying duplicate words", () => {
  const result = validateVocabularyRows([sample({ hanzi: "你好é" }), sample({ hanzi: "你好e\u0301", order: 2 })]);
  assert.ok(result.issues.some((entry) => entry.message.includes("Trùng Hanzi")));
});

test("blocks URLs, traversal, percent escapes and protocol-relative media", () => {
  for (const path of ["https://example.com/a.mp3", "//a.mp3", "/../a.mp3", "/media/%2e%2e/a.mp3", "/a\\b.mp3", "/test.svg", "/api/media/not-uuid"]) {
    assert.equal(isLocalAudioPath(path), false, path);
    assert.ok(validateVocabularyRows([sample({ audio_file: path })]).issues.length > 0, path);
  }
  for (const path of ["", "/media/demo.wav", "/clip.mp3", "/api/media/12345678-1234-1234-1234-123456789abc"]) assert.equal(isLocalAudioPath(path), true, path);
});

test("rejects duplicate/absent CSV headers and malformed quoting", () => {
  assert.ok(parseVocabularyText("hanzi,hanzi,pinyin,meaning_vi\n你,你,nǐ,Bạn").issues.length);
  assert.ok(parseVocabularyText("你,nǐ,Bạn").issues.length);
  assert.ok(parseVocabularyText('hanzi,pinyin,meaning_vi\n"你,nǐ,Bạn').issues.length);
});

test("enforces 2000 row and 5 MiB limits before parsing", async () => {
  assert.ok(validateVocabularyRows(Array.from({ length: 2001 }, (_, index) => sample({ hanzi: `你${index}`, order: index + 1 }))).issues[0].message.includes("2000"));
  assert.ok(parseVocabularyText("x".repeat(MAX_IMPORT_BYTES + 1)).issues[0].message.includes("5 MB"));
  assert.ok((await parseVocabularyFile(new Uint8Array(MAX_IMPORT_BYTES + 1), "large.xlsx")).issues[0].message.includes("5 MB"));
});

test("rejects non-UTF8 CSV and unsupported macro file extensions", async () => {
  assert.ok((await parseVocabularyFile(Uint8Array.from([0xff, 0xfe, 0x80]), "wrong.csv")).issues[0].message.includes("UTF-8"));
  assert.ok((await parseVocabularyFile(Buffer.from("fake"), "macro.xlsm")).issues[0].message.includes(".xlsm"));
});

test("exports formula prefixes and controls as inert quoted text", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-cmd", "@value", "\t=cmd", " \r=cmd"]) {
    const csv = exportVocabularyCsv([sample({ meaning_vi: value })]);
    assert.ok(csv.includes(`'${value}`), value);
  }
});

test("imports a real XLSX without executing formulas", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Từ vựng");
  sheet.addRow(["hanzi", "pinyin", "meaning_vi"]);
  sheet.addRow(["你好", "nǐ hǎo", "Xin chào"]);
  sheet.addRow(["谢谢", "xièxie", "Cảm ơn"]);
  const result = await parseVocabularyFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "sample.xlsx");
  assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].pinyin, "xièxie");
});

test("rejects XLSX formula cells even when cached results appear benign", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Test");
  sheet.addRow(["hanzi", "pinyin", "meaning_vi"]);
  sheet.addRow(["你好", "nǐ hǎo", { formula: 'HYPERLINK("https://example.com","Xin chào")', result: "Xin chào" }]);
  const result = await parseVocabularyFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "formula.xlsx");
  assert.ok(result.issues.some((entry) => entry.row === 2 && entry.message.includes("công thức")));
});

test("rejects malformed ZIP disguised as XLSX", async () => {
  const result = await parseVocabularyFile(Buffer.from("not a ZIP"), "fake.xlsx");
  assert.ok(result.issues[0].message.includes("Không đọc được XLSX"));
});


test("reports physical row numbers after empty lines and quoted newlines", () => {
  const input = 'hanzi,pinyin,meaning_vi\n\n你好,nǐ hǎo,"Xin\nchào"\n谢谢,,Cảm ơn';
  const result = parseVocabularyText(input);
  assert.ok(result.issues.some((entry) => entry.row === 5 && entry.message.includes("pinyin")));
});

test("bounds ZIP inflation even when uncompressed metadata lies", async () => {
  const name = Buffer.from("xl/workbook.xml");
  const compressed = deflateRawSync(Buffer.alloc(16 * 1024 * 1024, 65));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(1, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(1, 24);
  central.writeUInt16LE(name.length, 28);
  const directory = Buffer.concat([central, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  const archive = Buffer.concat([local, name, compressed, directory, end]);
  const result = await parseVocabularyFile(archive, "bomb.xlsx");
  assert.ok(result.issues[0].message.includes("giới hạn giải nén"));
});
