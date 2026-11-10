import type { PropsWithChildren } from "react";
import { MobileHeader } from "@/components/mobile-header";
import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
export default async function MainLayout({ children }: PropsWithChildren) {
  await requireUser();
  return <><MobileHeader /><Sidebar className="hidden lg:flex" /><main className="min-h-full pt-[50px] lg:pl-[256px] lg:pt-0"><div className="mx-auto max-w-[1152px] px-4 py-6">{children}</div></main></>;
}
