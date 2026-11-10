import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request,
} from "@playwright/test";
import ExcelJS from "exceljs";

import { sampleLessons } from "../../data/sample-course";

type Accounts = {
  password: string;
  admin: string;
  author: string;
  learner: string;
};
type Role = "admin" | "author" | "learner";
type Row = {
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

const origin = new URL(process.env.BASE_URL || "http://127.0.0.1:3000").origin;
const foreignRequests = new WeakMap<BrowserContext, string[]>();

async function accounts(): Promise<Accounts> {
  const file = process.env.TEST_ACCOUNTS_FILE || "work/test-accounts.json";
  const parsed = JSON.parse(await readFile(file, "utf8")) as Accounts;
  if (
    ![parsed.password, parsed.admin, parsed.author, parsed.learner].every(
      (value) => typeof value === "string" && value.length > 0
    )
  ) {
    throw new Error(
      "TEST_ACCOUNTS_FILE cần password, admin, author, learner được cấp riêng cho DB kiểm thử."
    );
  }
  return parsed;
}

async function login(page: Page, role: Role) {
  const credentials = await accounts();
  await page.goto("/sign-in");
  await page
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill(credentials[role]);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:learn|courses)(?:\?|$)/);
}

async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

async function post(page: Page, endpoint: string, data: unknown) {
  return page.request.post(endpoint, { headers: { Origin: origin }, data });
}

async function createDraft(page: Page) {
  const suffix = randomUUID().slice(0, 8);
  const title = `Khóa kiểm thử ${suffix}`;
  const response = await post(page, "/api/author/courses", {
    courseTitle: title,
    slug: `e2e-${suffix}`,
    description: "Dữ liệu giả dành riêng cho E2E",
    unitTitle: "Chào hỏi",
    lessonTitle: "Bài từ vựng kiểm thử",
    lessonCode: "L01",
    order: 1,
  });
  expect(response.status()).toBe(201);
  return {
    ...((await response.json()) as {
      courseId: number;
      unitId: number;
      lessonId: number;
    }),
    title,
  };
}

async function sampleCsv() {
  return readFile("templates/vocabulary_sample.csv", "utf8");
}

async function previewText(page: Page, lessonId: number, text: string) {
  const response = await post(page, "/api/author/preview", { lessonId, text });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    rows: Row[];
    issues: Array<{ row: number; message: string }>;
    receipt: string | null;
    examples: unknown[];
  }>;
}

async function screenshot(page: Page, name: string) {
  await mkdir("work/evidence", { recursive: true });
  await page.screenshot({
    path: path.join("work/evidence", `${name}.png`),
    fullPage: true,
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.content,
    "Nội dung không được làm tràn ngang toàn trang"
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function readPoints(page: Page) {
  await page.goto("/progress");
  const value = await page
    .getByText("Điểm tích lũy", { exact: true })
    .locator("..")
    .locator("dd")
    .innerText();
  return Number(value);
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.beforeEach(async ({ context }) => {
  const requests: string[] = [];
  foreignRequests.set(context, requests);
  context.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== origin
    )
      requests.push(request.url());
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin)
      await route.abort("blockedbyclient");
    else await route.continue();
  });
});

test.afterEach(async ({ context }) => {
  expect(
    foreignRequests.get(context),
    "Trình duyệt chỉ được gọi origin LAN; mọi request Internet bị chặn"
  ).toEqual([]);
});

test("A02/A03: khách bị chặn ở trang riêng và API quản trị", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in/);
  for (const endpoint of [
    "/api/users",
    "/api/courses",
    "/api/author/courses",
  ]) {
    expect((await page.request.get(endpoint)).status(), endpoint).toBe(401);
  }
  expect((await post(page, "/api/media", {})).status()).toBe(401);
  await page.goto("/sign-up");
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0);
});

test("C04: biểu mẫu đăng nhập có nhãn và thứ tự focus bàn phím", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const username = page.getByLabel("Tên đăng nhập", { exact: true });
  const password = page.getByLabel("Mật khẩu", { exact: true });
  const submit = page.getByRole("button", { name: "Đăng nhập", exact: true });
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(password).toHaveAttribute("type", "password");
  await username.focus();
  await expect(username).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  const unnamedImages = await page.locator("img:not([alt])").count();
  expect(unnamedImages).toBe(0);
  await screenshot(page, "login-keyboard-focus");
});

for (const role of ["learner", "author", "admin"] as const) {
  test(`A02/A03: đăng nhập, cookie, quyền và thu hồi phiên ${role}`, async ({
    page,
    context,
  }) => {
    await login(page, role);
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(
      (cookie) => cookie.name === "hnb_session"
    );
    expect(sessionCookie, "Có cookie session nội bộ").toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    expect((await page.request.get("/api/users")).status()).toBe(
      role === "admin" ? 200 : 403
    );
    expect((await page.request.get("/api/author/courses")).status()).toBe(
      role === "learner" ? 403 : 200
    );
    if (role !== "admin") {
      await page.goto("/admin");
      await expect(page).not.toHaveURL(/\/admin/);
    } else {
      await page.goto("/admin");
      await expect(
        page.getByRole("menuitem", { name: "Courses", exact: true })
      ).toBeVisible();
      await screenshot(page, "advanced-admin-local");
    }
    await logout(page);
    const replay = await page.request.get("/api/users", {
      headers: { Cookie: cookieHeader },
    });
    expect(replay.status(), "Đăng xuất thu hồi cookie cũ ở server").toBe(401);
    await page.goto("/learn");
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

test("B02/B03/B06: CSV/XLSX preview, lỗi dòng, nhập lặp, duyệt và phân quyền xuất bản", async ({
  page,
}) => {
  await login(page, "author");
  const draft = await createDraft(page);
  const csv = await sampleCsv();
  const broken = await previewText(
    page,
    draft.lessonId,
    csv.replace("nǐ hǎo", "")
  );
  expect(
    broken.issues.some(
      (issue) => issue.row === 2 && issue.message.includes("pinyin")
    )
  ).toBe(true);
  expect(broken.receipt).toBeNull();
  const csvFile = await page.request.post("/api/author/preview", {
    headers: { Origin: origin },
    multipart: {
      lessonId: String(draft.lessonId),
      file: {
        name: "tu-vung.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(`\uFEFF${csv}`),
      },
    },
  });
  expect(csvFile.status()).toBe(200);
  const preview = (await csvFile.json()) as {
    rows: Row[];
    issues: unknown[];
    receipt: string;
    examples: unknown[];
  };
  expect(preview.issues).toEqual([]);
  expect(preview.rows).toHaveLength(10);
  expect(preview.examples.length).toBeGreaterThan(0);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Từ vựng");
  const headers = Object.keys(preview.rows[0]);
  sheet.addRow(headers);
  for (const row of preview.rows)
    sheet.addRow(headers.map((header) => row[header as keyof Row]));
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  const excelResponse = await page.request.post("/api/author/preview", {
    headers: { Origin: origin },
    multipart: {
      lessonId: String(draft.lessonId),
      file: {
        name: "tu-vung.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsx,
      },
    },
  });
  expect(excelResponse.status()).toBe(200);
  const excelPreview = await excelResponse.json();
  expect(excelPreview.issues).toEqual([]);
  expect(excelPreview.rows).toEqual(preview.rows);
  for (const [index, expected] of [
    { inserted: 10 },
    { inserted: 0, skipped: 10 },
  ].entries()) {
    const saved = await post(page, "/api/author/save", {
      lessonId: draft.lessonId,
      rows: preview.rows,
      receipt: preview.receipt,
      mode: "skip",
    });
    expect(saved.status(), `Lần nhập ${index + 1}`).toBe(200);
    expect(await saved.json()).toMatchObject({
      ...expected,
      total: 10,
      questions: 20,
    });
  }
  const exportResponse = await page.request.get(
    `/api/author/export?lessonId=${draft.lessonId}`
  );
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");
  expect(await exportResponse.text()).toContain("nǐ hǎo");
  const forbidden = await post(page, "/api/author/transition", {
    lessonId: draft.lessonId,
    action: "publish",
  });
  expect(forbidden.status()).toBe(403);
  const crossOrigin = await page.request.post("/api/author/transition", {
    headers: { Origin: "https://invalid.example" },
    data: { lessonId: draft.lessonId, action: "submit" },
  });
  expect(crossOrigin.status()).toBe(403);
  expect(
    (
      await post(page, "/api/author/transition", {
        lessonId: draft.lessonId,
        action: "submit",
      })
    ).status()
  ).toBe(200);
  await logout(page);
  await login(page, "learner");
  await page.goto("/courses");
  await expect(
    page.getByRole("button", { name: new RegExp(draft.title) })
  ).toHaveCount(0);
  await logout(page);
  await login(page, "admin");
  expect(
    (
      await post(page, "/api/author/transition", {
        lessonId: draft.lessonId,
        action: "publish",
      })
    ).status()
  ).toBe(200);
  await logout(page);
  await login(page, "learner");
  await page.goto("/courses");
  await expect(
    page.getByRole("button", { name: new RegExp(draft.title) })
  ).toBeVisible();
});

test("B05: tải WAV local, phát bằng trình duyệt, byte-range và từ chối tệp giả", async ({
  page,
}) => {
  await login(page, "author");
  const wav = await readFile("data/test-tone.wav");
  const response = await page.request.post("/api/media", {
    headers: { Origin: origin },
    multipart: {
      file: {
        name: "am-thanh-kiem-thu.wav",
        mimeType: "audio/wav",
        buffer: wav,
      },
    },
  });
  expect(response.status()).toBe(201);
  const media = (await response.json()) as { path: string; mime: string };
  expect(media.mime).toBe("audio/wav");
  expect(media.path).toMatch(/^\/api\/media\/[a-f0-9-]+$/);
  const served = await page.request.get(media.path);
  expect(served.status()).toBe(200);
  expect(Buffer.from(await served.body())).toEqual(wav);
  const range = await page.request.get(media.path, {
    headers: { Range: "bytes=0-43" },
  });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(44);
  const played = await page.evaluate(async (mediaPath) => {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = mediaPath;
    audio.setAttribute(
      "aria-label",
      "Âm kiểm thử nguyên bản, không phải lời nói"
    );
    document.body.append(audio);
    await audio.play();
    return { duration: audio.duration, readyState: audio.readyState };
  }, media.path);
  expect(played.duration).toBeGreaterThan(0);
  expect(played.readyState).toBeGreaterThanOrEqual(2);
  const invalid = await page.request.post("/api/media", {
    headers: { Origin: origin },
    multipart: {
      file: {
        name: "gia-mao.wav",
        mimeType: "audio/wav",
        buffer: Buffer.from("<script>khong-phai-am-thanh</script>"),
      },
    },
  });
  expect(invalid.status()).toBe(400);
});

test("B01/B04/B07/C02: wizard 10 từ, upload, publish, học, chấm server, resume và mobile", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await login(page, "author");
  await page.goto("/author");
  const suffix = randomUUID().slice(0, 8);
  const courseTitle = `Hán ngữ E2E ${suffix}`;
  if (
    await page
      .getByRole("button", { name: "Tạo khóa / thêm bài", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Tạo khóa / thêm bài", exact: true })
      .click();
  }
  await page.getByLabel("Tên khóa", { exact: true }).fill(courseTitle);
  await page.getByLabel("Mã khóa", { exact: true }).fill(`wizard-${suffix}`);
  await page.getByLabel("Tên chủ đề", { exact: true }).fill("Chào hỏi và biển");
  await page
    .getByLabel("Tên bài", { exact: true })
    .fill("Bài 1: Từ vựng kiểm thử");
  await page.getByLabel("Mã bài", { exact: true }).fill("L01");
  await page
    .getByRole("button", { name: "Tạo bản nháp và nhập từ", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã tạo bản nháp");
  const paste = page.getByLabel(
    "Dán bảng từ Excel (Hanzi, Pinyin, nghĩa Việt) hoặc CSV có tên cột",
    { exact: true }
  );
  await paste.fill((await sampleCsv()).replace("nǐ hǎo", ""));
  await page
    .getByRole("button", { name: "Xem trước bảng dán", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Dòng 2" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xác nhận lưu bản nháp", exact: true })
  ).toBeDisabled();
  await page.getByLabel("Pinyin dòng 1", { exact: true }).fill("nǐ hǎo");
  await page
    .getByText("Ví dụ, nhãn, âm thanh", { exact: true })
    .first()
    .click();
  await page
    .getByLabel("Tải âm thanh dòng 1", { exact: true })
    .setInputFiles("data/test-tone.wav");
  await expect(page.getByRole("status")).toContainText(
    "Đã tải âm thanh nội bộ"
  );
  await page
    .getByRole("button", { name: "Kiểm tra / Xem trước", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Xác nhận lưu bản nháp", exact: true })
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Xác nhận lưu bản nháp", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("20 câu hỏi tự sinh");
  const exportLink = page.getByRole("link", { name: "Xuất CSV", exact: true });
  const lessonId = Number(
    new URL(
      (await exportLink.getAttribute("href")) || "",
      origin
    ).searchParams.get("lessonId")
  );
  expect(lessonId).toBeGreaterThan(0);
  const { rows } = (await (
    await page.request.get(`/api/author/lessons?lessonId=${lessonId}`)
  ).json()) as { rows: Row[] };
  expect(rows).toHaveLength(10);
  const meanings = new Map(rows.map((row) => [row.hanzi, row.meaning_vi]));
  const hanzi = new Map(rows.map((row) => [row.meaning_vi, row.hanzi]));
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoHorizontalOverflow(page);
    await screenshot(page, `author-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const downloadPromise = page.waitForEvent("download");
  await exportLink.click();
  const download = await downloadPromise;
  await download.saveAs("work/evidence/wizard-export.csv");
  await page.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Chờ duyệt");
  await expect(
    page.getByRole("button", { name: "Xuất bản", exact: true })
  ).toHaveCount(0);
  await logout(page);
  await login(page, "admin");
  await page.goto("/author");
  await page
    .getByRole("combobox", {
      name: "Chọn bài để biên soạn hoặc duyệt",
      exact: true,
    })
    .selectOption(String(lessonId));
  await page.getByRole("button", { name: "Xuất bản", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã xuất bản");
  await logout(page);
  await login(page, "learner");
  const startingPoints = await readPoints(page);
  await page.goto("/courses");
  await page.getByRole("button", { name: new RegExp(courseTitle) }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.getByRole("link", { name: /Tiếp tục: Bài 1/ }).click();
  await expect(
    page.getByRole("region", { name: "Thẻ từ vựng", exact: true })
  ).toBeVisible();
  await expect(page.getByText("nǐ hǎo", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Chưa chọn được khóa học. Vui lòng thử lại.", {
      exact: true,
    })
  ).toHaveCount(0);
  const lessonUrl = page.url();
  const html = await (await page.request.get(lessonUrl)).text();
  expect(html, "Payload bài học không chứa cờ đáp án đúng").not.toMatch(
    /(?:\\?"correct\\?")\s*:/
  );
  const audio = page
    .getByRole("region", { name: "Thẻ từ vựng" })
    .locator("audio");
  await expect(audio).toHaveCount(1);
  await audio.evaluate(async (element) => {
    await (element as HTMLAudioElement).play();
  });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoHorizontalOverflow(page);
    await screenshot(page, `lesson-cards-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  for (let index = 0; index < 5; index++)
    await page
      .getByRole("button", { name: "Thẻ tiếp theo", exact: true })
      .click();
  await expect(page.getByText("Thẻ 6/10", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Đến phần trắc nghiệm", exact: true })
    .click();
  let firstCorrectRequest: Request | undefined;
  let testedWrongAnswer = false;
  for (let index = 0; index < 20; index++) {
    const questionText = await page
      .getByRole("region", { name: "Trắc nghiệm", exact: true })
      .getByRole("heading", { level: 2 })
      .innerText();
    const selectMeaning = questionText.startsWith("Chọn nghĩa tiếng Việt:");
    const displayedPrompt = questionText.replace(
      /^Chọn (?:nghĩa tiếng Việt|chữ Hán):\s*/,
      ""
    );
    const prompt = selectMeaning
      ? displayedPrompt.split(" · ")[0]
      : displayedPrompt;
    const answer = (selectMeaning ? meanings : hanzi).get(prompt);
    expect(answer, `Từ được tạo từ dữ liệu thử: ${prompt}`).toBeDefined();
    const options = page.getByRole("group", {
      name: "Các phương án trả lời",
      exact: true,
    });
    if (!testedWrongAnswer) {
      const wrong = options
        .getByRole("button")
        .filter({ hasNotText: answer! })
        .first();
      await wrong.click();
      await page
        .getByRole("button", { name: "Kiểm tra đáp án", exact: true })
        .click();
      await expect(
        page.getByText("Chưa đúng.", { exact: false })
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Thử lại câu này", exact: true })
        .click();
      testedWrongAnswer = true;
    }
    await options
      .getByRole("button", {
        name: new RegExp(`^\\d+\\.\\s*${escaped(answer!)}$`),
      })
      .click();
    const actionRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" && Boolean(request.headers()["next-action"])
    );
    await page
      .getByRole("button", { name: "Kiểm tra đáp án", exact: true })
      .click();
    const sent = await actionRequest;
    if (!firstCorrectRequest) firstCorrectRequest = sent;
    await expect(
      page.getByText("Chính xác. Câu trả lời đã được máy chủ lưu.", {
        exact: true,
      })
    ).toBeVisible();
    if (index === 0) {
      await page.reload();
      await page
        .getByRole("button", { name: "Đến phần trắc nghiệm", exact: true })
        .click();
      await expect(page.getByText("Câu 1/19", { exact: true })).toBeVisible();
    } else {
      await page
        .getByRole("button", {
          name: index === 19 ? "Xem kết quả" : "Câu tiếp theo",
          exact: true,
        })
        .click();
    }
  }
  await expect(
    page.getByRole("region", { name: "Kết quả bài học", exact: true })
  ).toBeVisible();
  const pointsAfter = await readPoints(page);
  expect(pointsAfter - startingPoints).toBe(200);
  expect(firstCorrectRequest).toBeDefined();
  const replay = await page.request.post(firstCorrectRequest!.url(), {
    headers: {
      Origin: origin,
      "Next-Action": firstCorrectRequest!.headers()["next-action"],
      "Content-Type": firstCorrectRequest!.headers()["content-type"],
    },
    data: firstCorrectRequest!.postData()!,
  });
  expect(replay.status()).toBe(200);
  expect(await replay.text()).toContain('"awardedPoints":0');
  expect(await readPoints(page)).toBe(pointsAfter);
  await logout(page);
  await login(page, "learner");
  expect(await readPoints(page)).toBe(pointsAfter);
  await page.goto("/learn");
  await expect(
    page.getByText("1/1 bài hoàn thành · 100%", { exact: true })
  ).toBeVisible();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoHorizontalOverflow(page);
    await screenshot(page, `learner-progress-${width}`);
  }
  await page.goto(lessonUrl);
  await expect(
    page.getByText("Luyện lại không cộng điểm", { exact: false })
  ).toBeVisible();
});

test("C01/B07: học liên tục ba bài mẫu và giữ tiến độ sau đăng nhập lại", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await login(page, "learner");
  await page.goto("/courses");
  await page
    .getByRole("button", { name: /^Tiếng Trung cơ bản trên biển — bản mẫu/ })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
  for (const sample of sampleLessons.slice(0, 3)) {
    await page.goto("/learn");
    await page
      .locator("ol a")
      .filter({ hasText: sample.title })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Đến phần trắc nghiệm", exact: true })
      .click();
    const meanings = new Map(
      sample.entries.map(([hanzi, , meaning]) => [hanzi, meaning])
    );
    const words = new Map(
      sample.entries.map(([hanzi, , meaning]) => [meaning, hanzi])
    );
    let count = 0;
    while (
      await page
        .getByRole("region", { name: "Trắc nghiệm", exact: true })
        .isVisible()
    ) {
      const question = await page
        .getByRole("region", { name: "Trắc nghiệm", exact: true })
        .getByRole("heading", { level: 2 })
        .innerText();
      const displayedPrompt = question.replace(
        /^Chọn (?:nghĩa tiếng Việt|chữ Hán):\s*/,
        ""
      );
      const selectMeaning = question.startsWith("Chọn nghĩa tiếng Việt:");
      const prompt = selectMeaning
        ? displayedPrompt.split(" · ")[0]
        : displayedPrompt;
      const answer = (selectMeaning ? meanings : words).get(prompt);
      expect(answer).toBeDefined();
      await page
        .getByRole("group", { name: "Các phương án trả lời", exact: true })
        .getByRole("button", {
          name: new RegExp(`^\\d+\\.\\s*${escaped(answer!)}$`),
        })
        .click();
      await page
        .getByRole("button", { name: "Kiểm tra đáp án", exact: true })
        .click();
      await expect(
        page.getByText("Chính xác. Câu trả lời đã được máy chủ lưu.", {
          exact: true,
        })
      ).toBeVisible();
      const finish = page.getByRole("button", {
        name: "Xem kết quả",
        exact: true,
      });
      if (await finish.isVisible()) await finish.click();
      else
        await page
          .getByRole("button", { name: "Câu tiếp theo", exact: true })
          .click();
      count++;
      expect(count).toBeLessThanOrEqual(20);
    }
    await expect(
      page.getByRole("region", { name: "Kết quả bài học", exact: true })
    ).toBeVisible();
  }
  await page.goto("/progress");
  const completed = await page
    .getByText("Bài đã hoàn thành trong khóa", { exact: true })
    .locator("..")
    .locator("dd")
    .innerText();
  expect(Number(completed.split("/")[0])).toBeGreaterThanOrEqual(3);
  expect(completed.split("/")[1]).toBe("10");
  const points = await readPoints(page);
  await logout(page);
  await login(page, "learner");
  expect(await readPoints(page)).toBe(points);
  await screenshot(page, "sample-three-lessons-progress");
});
