import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "hnb_session";
export const createSessionToken = () => randomBytes(32).toString("hex");
export const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const isSessionToken = (token: string) => /^[a-f0-9]{64}$/.test(token);

export const sessionTtlSeconds = () => {
  const configured = Number(process.env.SESSION_TTL_SECONDS ?? 43_200);
  if (
    !Number.isInteger(configured) ||
    configured < 300 ||
    configured > 604_800
  ) {
    throw new Error("SESSION_TTL_SECONDS phải từ 300 đến 604800 giây.");
  }
  return configured;
};
