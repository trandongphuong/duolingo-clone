import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { currentUser } from "@/lib/auth";

import { Button } from "./ui/button";

export const SignOutButton = () => (
  <form action={signOut}>
    <Button type="submit" variant="ghost" size="sm">
      Đăng xuất
    </Button>
  </form>
);

export const SessionControls = async () => {
  const user = await currentUser();
  if (!user)
    return (
      <Button asChild variant="ghost">
        <Link href="/sign-in">Đăng nhập</Link>
      </Button>
    );
  return (
    <div className="flex items-center gap-3">
      <span className="max-w-36 truncate text-sm font-semibold">
        {user.firstName}
      </span>
      <SignOutButton />
    </div>
  );
};
