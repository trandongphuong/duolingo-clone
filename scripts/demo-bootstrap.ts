import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { Pool } from "pg";

import { DemoConfigError, readDemoConfig } from "../lib/demo-config";
import { hashPassword } from "../lib/password";

const runFile = promisify(execFile);
const DEMO_DATABASE_LOCK = 74820412;
const DEMO_ADMIN_LOCK = 74820413;

class DemoBootstrapError extends Error {}

const main = async () => {
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    throw new DemoBootstrapError("Chạy bootstrap demo bằng Node.js 24.");
  }
  const config = readDemoConfig(process.env);
  const cwd = process.cwd();
  const packaged = ["migrate", "seed"].every((name) =>
    existsSync(path.resolve(cwd, "maintenance", `${name}.cjs`))
  );
  const maintenanceCommands = ["migrate", "seed"].map((name) => {
    const entry = path.resolve(
      cwd,
      packaged ? "maintenance" : "scripts",
      `${name}.${packaged ? "cjs" : "ts"}`
    );
    if (!existsSync(entry)) {
      throw new DemoBootstrapError(
        "Thiếu migrate/seed; chạy từ thư mục gốc source hoặc image có maintenance/*.cjs."
      );
    }
    return packaged ? [entry] : ["--import", "tsx", entry];
  });

  // The child tasks need the database, but never the demo admin/session secrets.
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: config.databaseUrl,
    APP_ORIGIN: config.appOrigin,
    SESSION_SECURE: "true",
    NODE_ENV: "production",
  };
  delete childEnvironment.DEMO_ADMIN_PASSWORD;
  delete childEnvironment.SESSION_PASSWORD;

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  // Never emit a raw connection error (it may contain host or credential data).
  pool.on("error", () => {});
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock($1)", [
          DEMO_DATABASE_LOCK,
        ]);
        const marker = await client.query<{ marker: string | null }>(
          "SELECT to_regclass('public.hnb_demo_bootstrap')::text AS marker"
        );
        if (marker.rows[0]?.marker) {
          const policy = await client.query<{ data_policy: string }>(
            "SELECT data_policy FROM public.hnb_demo_bootstrap WHERE singleton = true"
          );
          if (policy.rows[0]?.data_policy !== "SYNTHETIC_ONLY") {
            throw new DemoBootstrapError(
              "Từ chối cơ sở dữ liệu có marker demo không hợp lệ."
            );
          }
        } else {
          const tables = await client.query<{ present: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public') AS present"
          );
          if (tables.rows[0]?.present) {
            throw new DemoBootstrapError(
              "Từ chối cơ sở dữ liệu đã có bảng nhưng không có marker demo. Hãy cấp cơ sở dữ liệu demo mới, rỗng."
            );
          }
          await client.query(
            `CREATE TABLE public.hnb_demo_bootstrap (
              singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
              data_policy text NOT NULL CHECK (data_policy = 'SYNTHETIC_ONLY'),
              created_at timestamptz NOT NULL DEFAULT now()
            )`
          );
          await client.query(
            "INSERT INTO public.hnb_demo_bootstrap (data_policy) VALUES ('SYNTHETIC_ONLY')"
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      for (const [index, args] of maintenanceCommands.entries()) {
        try {
          // Capture output: existing tasks may include raw database errors.
          await runFile(process.execPath, args, {
            cwd,
            env: childEnvironment,
            maxBuffer: 1024 * 1024,
            timeout: 120_000,
          });
        } catch {
          throw new DemoBootstrapError(
            index === 0
              ? "Migration demo thất bại; không chạy seed hoặc tạo tài khoản. Kiểm tra kết nối và quyền cơ sở dữ liệu."
              : "Seed demo thất bại; chưa tạo tài khoản. Kiểm tra migration và quyền cơ sở dữ liệu."
          );
        }
        console.log(index === 0 ? "Migration demo: PASS." : "Seed demo: PASS.");
      }

      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock($1)", [
          DEMO_ADMIN_LOCK,
        ]);
        const existing = await client.query<{ role: string; active: boolean }>(
          "SELECT role, active FROM users WHERE username = $1 FOR UPDATE",
          [config.adminUsername]
        );
        const alreadyExists = existing.rows.length > 0;
        if (alreadyExists) {
          if (existing.rows[0].role !== "admin" || !existing.rows[0].active) {
            throw new DemoBootstrapError(
              "Tên đăng nhập demo đã thuộc tài khoản không phải admin đang hoạt động; tài khoản không bị thay đổi."
            );
          }
        } else {
          const passwordHash = await hashPassword(config.adminPassword);
          await client.query(
            `INSERT INTO users (id, username, display_name, password_hash, role, active)
             VALUES ($1, $2, $3, $4, 'admin', true)`,
            [randomUUID(), config.adminUsername, "Quản trị demo", passwordHash]
          );
        }
        await client.query("COMMIT");
        console.log(
          alreadyExists
            ? "Admin demo đã tồn tại; giữ nguyên mật khẩu, vai trò và trạng thái."
            : "Đã tạo tài khoản quản trị demo."
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log("Bootstrap demo: PASS. Chỉ sử dụng dữ liệu giả lập.");
};

main().catch((error: unknown) => {
  console.error(
    error instanceof DemoConfigError || error instanceof DemoBootstrapError
      ? error.message
      : "Bootstrap demo thất bại; kiểm tra kết nối, cấu hình TLS và quyền cơ sở dữ liệu. Không có bí mật nào được ghi vào log."
  );
  process.exitCode = 1;
});
