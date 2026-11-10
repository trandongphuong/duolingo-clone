import Image from "next/image";
import Link from "next/link";

export const Header = () => (
  <header className="h-20 w-full border-b-2 border-slate-200 px-4">
    <div className="mx-auto flex h-full max-w-screen-lg items-center">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/han-ngu-bien.svg" alt="" height={40} width={40} />
        <span className="text-xl font-extrabold text-sky-700">
          Hán ngữ biển 1.0
        </span>
      </Link>
    </div>
  </header>
);
