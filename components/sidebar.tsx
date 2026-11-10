import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
const items = [["Khóa học", "/courses"], ["Học", "/learn"], ["Ôn tập", "/review"], ["Tiến độ", "/progress"], ["Tài khoản", "/account"], ["Biên soạn", "/author"]];
export const Sidebar = ({ className }: {className?: string}) => <aside className={cn("left-0 top-0 flex h-full flex-col border-r bg-white px-4 lg:fixed lg:w-[256px]", className)}><Link href="/learn" className="flex items-center gap-3 py-8 font-bold text-sky-800"><Image src="/han-ngu-bien.svg" width={42} height={42} alt="" />Hán ngữ biển</Link><nav aria-label="Điều hướng chính" className="flex flex-col gap-2">{items.map(([title, href]) => <Link key={href} className="rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-sky-600" href={href}>{title}</Link>)}</nav><p className="mt-auto py-6 text-xs text-slate-500">DỮ LIỆU MẪU CHƯA KIỂM DUYỆT</p></aside>;
