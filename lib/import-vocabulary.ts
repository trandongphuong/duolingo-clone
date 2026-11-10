import { inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";
import Papa from "papaparse";

export const MAX_IMPORT_ROWS = 2_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_XLSX_EXPANDED_BYTES = 25 * 1024 * 1024;
const MAX_XLSX_ENTRY_BYTES = 15 * 1024 * 1024;

export const VOCABULARY_COLUMNS = [
  "lesson_code", "order", "hanzi", "pinyin", "meaning_vi", "example_zh",
  "example_pinyin", "example_vi", "audio_file", "tags",
] as const;

export type VocabularyRow = {
  lesson_code: string;
  order: number;
  hanzi: string;
  pinyin: string;
  meaning_vi: string;
  example_zh: string;
  example_pinyin: string;
  example_vi: string;
  audio_file: string;
  tags: string;
};

export type ImportIssue = { row: number; message: string };
export type ImportResult = {
  rows: VocabularyRow[];
  issues: ImportIssue[];
  warnings: ImportIssue[];
};

const emptyResult = (message: string): ImportResult => ({
  rows: [], issues: [{ row: 1, message }], warnings: [],
});

/** Only relative local assets; existence and content-type are checked by the caller. */
export function isLocalAudioPath(value: string): boolean {
  if (!value) return true;
  return (/^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) || /^(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.(?:mp3|wav|ogg)$/i.test(value))
    && !value.includes("..");
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" && typeof value !== "number") return null;
  return String(value).normalize("NFC").trim();
}

export function validateVocabularyRows(input: unknown[], sourceRowNumbers?: number[]): ImportResult {
  if (!Array.isArray(input) || input.length === 0) return emptyResult("Chưa có dòng từ vựng để nhập.");
  if (input.length > MAX_IMPORT_ROWS) return emptyResult(`Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ROWS} dòng.`);
  const result: ImportResult = { rows: [], issues: [], warnings: [] };
  const knownWords = new Map<string, number>();
  const knownOrders = new Map<string, number>();
  input.forEach((candidate, index) => {
    const rowNumber = sourceRowNumbers?.[index] ?? index + 2;
    const issue = (message: string) => result.issues.push({ row: rowNumber, message });
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      issue("Dòng dữ liệu không hợp lệ.");
      return;
    }
    const item = candidate as Record<string, unknown>;
    const cells: Record<string, string> = {};
    for (const column of VOCABULARY_COLUMNS) {
      const value = asString(item[column]);
      if (value === null) issue(`Cột ${column} phải là văn bản hoặc số, không chứa công thức/đối tượng.`);
      cells[column] = value ?? "";
      const maxLength = column.startsWith("example_") ? 2_000 : 500;
      if (cells[column].length > maxLength) issue(`Cột ${column} vượt quá ${maxLength} ký tự.`);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cells[column])) issue(`Cột ${column} chứa ký tự điều khiển không hợp lệ.`);
    }
    const order = cells.order ? Number(cells.order) : index + 1;
    const row: VocabularyRow = {
      lesson_code: cells.lesson_code || "L01",
      order,
      hanzi: cells.hanzi,
      pinyin: cells.pinyin,
      meaning_vi: cells.meaning_vi,
      example_zh: cells.example_zh,
      example_pinyin: cells.example_pinyin,
      example_vi: cells.example_vi,
      audio_file: cells.audio_file,
      tags: cells.tags,
    };
    for (const column of ["hanzi", "pinyin", "meaning_vi"] as const) {
      if (!row[column]) issue(`Thiếu trường bắt buộc ${column}.`);
    }
    if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(row.lesson_code)) issue("lesson_code chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới (tối đa 80 ký tự).");
    if (!Number.isSafeInteger(row.order) || row.order < 1 || row.order > MAX_IMPORT_ROWS) issue(`order phải là số nguyên từ 1 đến ${MAX_IMPORT_ROWS}.`);
    const wordKey = `${row.lesson_code}\u0000${row.hanzi.toLocaleLowerCase("vi")}`;
    const orderKey = `${row.lesson_code}\u0000${row.order}`;
    if (row.hanzi && knownWords.has(wordKey)) issue(`Trùng Hanzi với dòng ${knownWords.get(wordKey)} trong cùng bài.`);
    if (knownOrders.has(orderKey)) issue(`Trùng thứ tự với dòng ${knownOrders.get(orderKey)} trong cùng bài.`);
    if (row.hanzi) knownWords.set(wordKey, rowNumber);
    knownOrders.set(orderKey, rowNumber);
    if (!isLocalAudioPath(row.audio_file)) issue("audio_file phải là đường dẫn âm thanh nội bộ .mp3/.wav/.ogg, không có URL mạng hoặc ký tự đường dẫn đặc biệt.");
    if (!row.audio_file) result.warnings.push({ row: rowNumber, message: "Chưa có âm thanh; vẫn học được bằng chữ và Pinyin." });
    result.rows.push(row);
  });
  return result;
}

function parseMatrix(matrix: unknown[][], format: "csv" | "tsv", sourceRows?: number[]): ImportResult {
  const entries = matrix.map((cells, index) => ({ cells, row: sourceRows?.[index] ?? index + 1 }))
    .filter(({ cells }) => cells.some((value) => String(value ?? "").trim()));
  if (entries.length === 0) return emptyResult("Tệp hoặc bảng đang trống.");
  const first = entries[0].cells.map((value) => asString(value)?.replace(/^\uFEFF/, "") ?? "");
  const hasHeader = first.some((value) => ["hanzi", "pinyin", "meaning_vi"].includes(value));
  if (format === "csv" && !hasHeader) return emptyResult("CSV phải có hàng tên cột hanzi,pinyin,meaning_vi.");
  const headers = hasHeader ? first : ["hanzi", "pinyin", "meaning_vi", "example_zh", "example_pinyin", "example_vi", "audio_file", "tags"];
  const duplicates = headers.filter((value, index) => value && headers.indexOf(value) !== index);
  if (duplicates.length) return emptyResult(`Tên cột bị trùng: ${[...new Set(duplicates)].join(", ")}.`);
  const missing = ["hanzi", "pinyin", "meaning_vi"].filter((name) => !headers.includes(name));
  if (missing.length) return emptyResult(`Thiếu cột bắt buộc: ${missing.join(", ")}.`);
  const content = hasHeader ? entries.slice(1) : entries;
  if (content.length > MAX_IMPORT_ROWS) return emptyResult(`Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ROWS} dòng.`);
  const records = content.map(({ cells }) => Object.fromEntries(headers.map((column, index) => [column, cells[index] ?? ""])));
  const result = validateVocabularyRows(records, content.map(({ row }) => row));
  content.forEach(({ cells, row }) => {
    if (cells.length > headers.length && cells.slice(headers.length).some((value) => String(value ?? "").trim())) {
      result.issues.push({ row, message: "Số ô nhiều hơn số cột; kiểm tra dấu phân cách hoặc dấu ngoặc kép." });
    }
  });
  return result;
}

export function parseVocabularyText(text: string, format?: "csv" | "tsv"): ImportResult {
  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) return emptyResult("Tệp vượt quá 5 MB.");
  const source = text.replace(/^\uFEFF/, "");
  const chosenFormat = format ?? (source.split(/\r?\n/, 1)[0].includes("\t") ? "tsv" : "csv");
  const matrix: unknown[][] = [];
  const sourceRows: number[] = [];
  const parseIssues: ImportIssue[] = [];
  let cursor = 0;
  let physicalLine = 1;
  Papa.parse<unknown[]>(source, {
    delimiter: chosenFormat === "tsv" ? "\t" : ",",
    skipEmptyLines: false,
    dynamicTyping: false,
    step: (step) => {
      matrix.push(step.data);
      sourceRows.push(physicalLine);
      parseIssues.push(...step.errors.map((error) => ({ row: physicalLine, message: `Không đọc được CSV/TSV: ${error.message}` })));
      physicalLine += (source.slice(cursor, step.meta.cursor).match(/\r\n|\r|\n/g) ?? []).length;
      cursor = step.meta.cursor;
    },
  });
  const result = parseMatrix(matrix, chosenFormat, sourceRows);
  result.issues.push(...parseIssues);
  return result;
}

/** Inspect and inflate every entry with strict bounds before handing an XLSX archive to ExcelJS. */
function inspectXlsxArchive(input: Uint8Array): void {
  const buffer = Buffer.from(input);
  let directoryEnd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      directoryEnd = offset;
      break;
    }
  }
  if (directoryEnd < 0) throw new Error("XLSX không phải tệp ZIP hợp lệ.");
  const entries = buffer.readUInt16LE(directoryEnd + 10);
  const directorySize = buffer.readUInt32LE(directoryEnd + 12);
  let offset = buffer.readUInt32LE(directoryEnd + 16);
  if (entries === 0 || entries > 300 || entries === 0xffff || directorySize === 0xffffffff || offset + directorySize > directoryEnd) throw new Error("XLSX có cấu trúc hoặc số lượng tệp không được hỗ trợ.");
  let expanded = 0;
  let containsWorkbook = false;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > directoryEnd || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Thư mục ZIP của XLSX không hợp lệ.");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > directoryEnd || (flags & 1) || ![0, 8].includes(method) || localOffset + 30 > buffer.length || uncompressedSize > MAX_XLSX_ENTRY_BYTES) throw new Error("XLSX được mã hóa hoặc vượt giới hạn giải nén.");
    if (/vbaProject|externalLinks|(?:^|\/)\.\.(?:\/|$)|\\|^\//i.test(name)) throw new Error("Không chấp nhận macro, liên kết ngoài hoặc đường dẫn bất thường trong XLSX.");
    if (name === "xl/workbook.xml") containsWorkbook = true;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Mục dữ liệu ZIP của XLSX không hợp lệ.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    if (localName !== name || dataOffset + compressedSize > directoryEnd) throw new Error("Đường dẫn hoặc độ dài ZIP không khớp.");
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const value = method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_ENTRY_BYTES }) : compressed;
    expanded += value.length;
    if (value.length !== uncompressedSize || expanded > MAX_XLSX_EXPANDED_BYTES) throw new Error("Nội dung giải nén XLSX vượt quá 25 MB hoặc không khớp kích thước.");
    if (/\.(?:xml|rels)$/i.test(name) && /<!DOCTYPE|<!ENTITY/i.test(value.toString("utf8"))) throw new Error("XLSX chứa khai báo XML không được hỗ trợ.");
    if (name === "[Content_Types].xml" && /macroEnabled|vbaProject/i.test(value.toString("utf8"))) throw new Error("Không chấp nhận XLSX có macro.");
  }
  if (!containsWorkbook) throw new Error("Không tìm thấy workbook trong XLSX.");
}

export async function parseVocabularyFile(buffer: Uint8Array, fileName: string): Promise<ImportResult> {
  if (buffer.byteLength > MAX_IMPORT_BYTES) return emptyResult("Tệp vượt quá 5 MB.");
  const extension = fileName.toLocaleLowerCase("en").split(".").pop();
  if (extension === "csv") {
    try {
      return parseVocabularyText(new TextDecoder("utf-8", { fatal: true }).decode(buffer), "csv");
    } catch {
      return emptyResult("CSV phải dùng mã hóa UTF-8.");
    }
  }
  if (extension !== "xlsx") return emptyResult("Chỉ chấp nhận tệp .csv hoặc .xlsx, không nhận macro .xlsm.");
  try {
    inspectXlsxArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount > MAX_IMPORT_ROWS + 1 || sheet.columnCount > 30) return emptyResult("XLSX phải có một bảng dữ liệu tối đa 2.000 dòng và 30 cột.");
    const matrix: unknown[][] = [];
    const sourceRows: number[] = [];
    const formulaIssues: ImportIssue[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values: unknown[] = [];
      for (let column = 1; column <= sheet.columnCount; column++) {
        const cell = row.getCell(column);
        if (cell.type === ExcelJS.ValueType.Formula || cell.formula || cell.type === ExcelJS.ValueType.Hyperlink) {
          formulaIssues.push({ row: rowNumber, message: "Không chấp nhận công thức hoặc liên kết trong XLSX; hãy dán giá trị văn bản." });
          values.push("");
        } else if (cell.type === ExcelJS.ValueType.RichText) {
          const value = cell.value as ExcelJS.CellRichTextValue;
          values.push(value.richText.map((run) => run.text).join(""));
        } else if (cell.value instanceof Date || (cell.value !== null && typeof cell.value === "object")) {
          formulaIssues.push({ row: rowNumber, message: "Ô XLSX phải chứa văn bản hoặc số đơn giản." });
          values.push("");
        } else {
          values.push(cell.value ?? "");
        }
      }
      matrix.push(values);
      sourceRows.push(rowNumber);
    });
    const result = parseMatrix(matrix, "csv", sourceRows);
    result.issues.push(...formulaIssues);
    if (workbook.worksheets.length > 1) result.warnings.push({ row: 1, message: "Chỉ đọc trang tính đầu tiên của XLSX." });
    return result;
  } catch {
    return emptyResult("Không đọc được XLSX: tệp hỏng, có macro/liên kết ngoài hoặc vượt giới hạn giải nén.");
  }
}

function csvSafe(value: unknown): string {
  const text = String(value ?? "");
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\u0000-\u001f]/.test(text) ? `'${text}` : text;
}

export function exportVocabularyCsv(rows: VocabularyRow[]): string {
  const values = rows.map((row) => VOCABULARY_COLUMNS.map((column) => csvSafe(row[column])));
  return `\uFEFF${Papa.unparse({ fields: [...VOCABULARY_COLUMNS], data: values }, { newline: "\r\n" })}`;
}
