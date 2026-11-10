import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  outputFileTracingExcludes: { "/*": ["./work/**/*", "./.env*", "./.git/**/*", "./tests/**/*"] },
  images: { unoptimized: true },
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    const development = process.env.NODE_ENV !== "production";
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'${development ? " ws: wss:" : ""}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` },
    ] }];
  },
};
export default nextConfig;
