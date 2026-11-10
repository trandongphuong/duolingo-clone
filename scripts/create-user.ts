import { randomUUID } from "node:crypto";

import dotenv from "dotenv";

import { hashPassword, normalizeUsername } from "../lib/password";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const main = async () => {
  const [usernameArgument, roleArgument = "learner", ...displayNameArguments] =
    process.argv.slice(2);
  if (
    !usernameArgument ||
    !["admin", "author", "learner"].includes(roleArgument)
  ) {
    throw new Error(
      "Cách dùng: pnpm auth:create <tên-đăng-nhập> [admin|author|learner] [tên hiển thị]. Nhập mật khẩu qua stdin."
    );
  }
  if (process.stdin.isTTY)
    throw new Error(
      "Nhập mật khẩu kín qua stdin. Bash: read -rs PASSWORD; printf '%s' \"$PASSWORD\" | pnpm auth:create hocvien learner; unset PASSWORD"
    );
  const username = normalizeUsername(usernameArgument);
  let passwordInput = "";
  for await (const chunk of process.stdin) {
    passwordInput += chunk.toString();
    if (Buffer.byteLength(passwordInput, "utf8") > 1024)
      throw new Error("Mật khẩu quá dài.");
  }
  const passwordHash = await hashPassword(passwordInput.replace(/\r?\n$/, ""));
  const displayName = displayNameArguments.join(" ").trim() || username;
  if (displayName.length > 100)
    throw new Error("Tên hiển thị tối đa 100 ký tự.");
  const [{ default: db }, { localUsers }] = await Promise.all([
    import("../db/drizzle"),
    import("../db/auth-schema"),
  ]);
  const created = await db
    .insert(localUsers)
    .values({
      id: randomUUID(),
      username,
      displayName,
      passwordHash,
      role: roleArgument as "admin" | "author" | "learner",
    })
    .onConflictDoNothing({ target: localUsers.username })
    .returning({ id: localUsers.id });
  if (!created.length)
    throw new Error(
      "Tên đăng nhập đã tồn tại; tài khoản hiện có không bị thay đổi."
    );
  console.log(`Đã tạo tài khoản ${username} (${roleArgument}).`);
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && !error.message.startsWith("Failed query")
        ? error.message
        : "Không thể tạo tài khoản. Kiểm tra kết nối và migration cơ sở dữ liệu."
    );
    process.exit(1);
  });
