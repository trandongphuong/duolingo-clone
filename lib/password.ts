import { compare, hash } from "bcryptjs";

export class PasswordInputError extends Error {}

export const validatePassword = (password: string) => {
  // bcrypt truncates beyond 72 bytes; reject rather than silently truncate.
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new PasswordInputError(
      "Mật khẩu phải có ít nhất 12 ký tự và tối đa 72 byte UTF-8."
    );
  }
};

export const normalizeUsername = (username: string) => {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) {
    throw new PasswordInputError(
      "Tên đăng nhập phải có 3–64 ký tự: a–z, 0–9, dấu chấm, gạch dưới hoặc gạch ngang."
    );
  }
  return normalized;
};

export const hashPassword = async (password: string) => {
  validatePassword(password);
  return hash(password, 12);
};

// Fixed valid cost-12 hash used only for timing on nonexistent accounts.
export const DUMMY_PASSWORD_HASH =
  "$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const verifyPassword = async (password: string, storedHash: string) => {
  if (!password || Buffer.byteLength(password, "utf8") > 72) return false;
  if (!/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(storedHash)) return false;
  return compare(password, storedHash);
};
