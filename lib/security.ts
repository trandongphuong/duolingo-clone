/** Reject cross-origin cookie-authenticated writes, including missing origins. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== allowed || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("Yêu cầu khác nguồn bị từ chối.");
  }
}

export function isLocalAsset(value: string): boolean {
  return /^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..") && !value.includes("\\");
}
