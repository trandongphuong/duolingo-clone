import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "work/e2e-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "work/evidence/playwright-results.json" }],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3000",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_EXECUTABLE_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
});
