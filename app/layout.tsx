import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#0369a1" };
export const metadata: Metadata = siteConfig;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><Toaster theme="light" richColors closeButton />{children}</body></html>;
}
