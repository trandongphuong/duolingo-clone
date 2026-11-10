import Image from "next/image";
import Link from "next/link";
import { SessionControls } from "@/components/session-controls";
export const Header = () => <header className="border-b bg-white px-4 py-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4"><Link href="/" className="flex items-center gap-3 font-bold text-sky-800"><Image src="/han-ngu-bien.svg" width={42} height={42} alt="" /><span>Hán ngữ biển <small>1.0</small></span></Link><SessionControls /></div></header>;
