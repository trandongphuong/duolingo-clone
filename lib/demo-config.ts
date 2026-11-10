import { normalizeUsername, validatePassword } from "./password";

export class DemoConfigError extends Error {}

export type DemoConfig = Readonly<{
  databaseUrl: string;
  databaseName: string;
  sessionPassword: string;
  appOrigin: string;
  adminUsername: string;
  adminPassword: string;
}>;

/** Validate before connecting to PostgreSQL or starting any maintenance task. */
export const readDemoConfig = (
  environment: Readonly<Record<string, string | undefined>>
): DemoConfig => {
  if (
    environment.DEMO_MODE !== "true" ||
    environment.DEMO_DATA_POLICY !== "SYNTHETIC_ONLY"
  ) {
    throw new DemoConfigError(
      "Bootstrap demo yêu cầu DEMO_MODE=true và DEMO_DATA_POLICY=SYNTHETIC_ONLY."
    );
  }

  let databaseUrl: URL;
  let databaseName: string;
  try {
    databaseUrl = new URL(environment.DATABASE_URL ?? "");
    databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw new DemoConfigError("DATABASE_URL phải là URL PostgreSQL hợp lệ.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname ||
    databaseUrl.hash ||
    !/^[a-z0-9_-]*demo[a-z0-9_-]*$/i.test(databaseName) ||
    [...databaseUrl.searchParams.keys()].some((key) =>
      ["database", "dbname"].includes(key.toLowerCase())
    )
  ) {
    throw new DemoConfigError(
      "DATABASE_URL phải trỏ trực tiếp tới cơ sở dữ liệu riêng có tên chứa demo; không dùng tham số ghi đè tên cơ sở dữ liệu."
    );
  }

  const sessionPassword = environment.SESSION_PASSWORD ?? "";
  if (sessionPassword.length < 32) {
    throw new DemoConfigError("SESSION_PASSWORD phải có ít nhất 32 ký tự.");
  }
  if (
    environment.SESSION_SECURE !== undefined &&
    environment.SESSION_SECURE !== "true"
  ) {
    throw new DemoConfigError("SESSION_SECURE của demo HTTPS phải là true.");
  }

  let origin: URL;
  try {
    origin = new URL(environment.APP_ORIGIN ?? "");
  } catch {
    throw new DemoConfigError("APP_ORIGIN phải là origin HTTPS hợp lệ.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.origin !== environment.APP_ORIGIN
  ) {
    throw new DemoConfigError(
      "APP_ORIGIN phải là origin HTTPS chính xác, không có đường dẫn, query, fragment hoặc thông tin đăng nhập."
    );
  }

  let adminUsername: string;
  try {
    adminUsername = normalizeUsername(
      environment.DEMO_ADMIN_USERNAME ?? "demo_admin"
    );
  } catch {
    throw new DemoConfigError("DEMO_ADMIN_USERNAME không hợp lệ.");
  }
  const adminPassword = environment.DEMO_ADMIN_PASSWORD ?? "";
  try {
    validatePassword(adminPassword);
  } catch {
    throw new DemoConfigError(
      "DEMO_ADMIN_PASSWORD phải có ít nhất 12 ký tự và tối đa 72 byte UTF-8."
    );
  }

  return Object.freeze({
    databaseUrl: environment.DATABASE_URL!,
    databaseName,
    sessionPassword,
    appOrigin: origin.origin,
    adminUsername,
    adminPassword,
  });
};
