import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class RenderConfigError extends Error {}

export function createRenderEnvironment(environment) {
  if (
    environment.RENDER !== "true" ||
    environment.DEMO_MODE !== "true" ||
    environment.DEMO_DATA_POLICY !== "SYNTHETIC_ONLY"
  ) {
    throw new RenderConfigError(
      "Chỉ chạy entry point này cho demo Render có RENDER=true, DEMO_MODE=true và DEMO_DATA_POLICY=SYNTHETIC_ONLY."
    );
  }
  const appOrigin = environment.APP_ORIGIN ?? environment.RENDER_EXTERNAL_URL;
  let origin;
  try {
    origin = new URL(appOrigin);
  } catch {
    throw new RenderConfigError("Thiếu origin HTTPS hợp lệ cho demo Render.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.origin !== appOrigin
  ) {
    throw new RenderConfigError("Origin demo Render phải là origin HTTPS chính xác.");
  }
  if (environment.SESSION_SECURE !== undefined && environment.SESSION_SECURE !== "true") {
    throw new RenderConfigError("Demo Render yêu cầu cookie Secure.");
  }
  const port = environment.PORT ?? "10000";
  if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535) {
    throw new RenderConfigError("PORT phải là số nguyên từ 1 đến 65535.");
  }
  return {
    ...environment,
    APP_ORIGIN: appOrigin,
    PORT: port,
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    SESSION_SECURE: "true",
    DEMO_MEDIA_STORAGE: "ephemeral",
    MEDIA_DIR: path.resolve(environment.MEDIA_DIR ?? "/data/media"),
  };
}

export async function startRenderServer() {
  const environment = createRenderEnvironment(process.env);
  const cwd = process.cwd();
  const bootstrap = path.join(cwd, "maintenance/demo-bootstrap.cjs");
  const server = path.join(cwd, "server.js");
  if (!existsSync(bootstrap) || !existsSync(server)) {
    throw new RenderConfigError("Thiếu runtime đã đóng gói; chạy từ thư mục /app của image Docker.");
  }

  let child;
  let stoppingSignal;
  const stop = (signal) => {
    stoppingSignal ??= signal;
    child?.kill(signal);
  };
  const onTerm = () => stop("SIGTERM");
  const onInt = () => stop("SIGINT");
  process.on("SIGTERM", onTerm);
  process.on("SIGINT", onInt);

  const runNode = (entry, env) => new Promise((resolve, reject) => {
    child = spawn(process.execPath, [entry], { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      resolve({ code, signal });
    });
  });
  try {
    // Free Render has no pre-deploy command. Bootstrap is idempotent and guarded.
    const initialized = await runNode(bootstrap, environment);
    if (stoppingSignal) return stoppingSignal === "SIGINT" ? 130 : 143;
    if (initialized.code !== 0 || initialized.signal) {
      console.error("Bootstrap demo thất bại; chưa khởi động web.");
      return initialized.code || 1;
    }
    const webEnvironment = { ...environment };
    delete webEnvironment.DEMO_ADMIN_PASSWORD;
    const result = await runNode(server, webEnvironment);
    if (stoppingSignal) return stoppingSignal === "SIGINT" ? 130 : 143;
    return result.code ?? 1;
  } finally {
    process.off("SIGTERM", onTerm);
    process.off("SIGINT", onInt);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startRenderServer().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error instanceof RenderConfigError
      ? error.message
      : "Khởi động demo Render thất bại. Kiểm tra cấu hình và runtime đã đóng gói.");
    process.exitCode = 1;
  });
}
