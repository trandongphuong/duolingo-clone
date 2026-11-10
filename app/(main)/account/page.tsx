import Link from "next/link";

import { SignOutButton } from "@/components/session-controls";
import { requireUser } from "@/lib/auth";

import { PasswordForm } from "./password-form";
import { UserManager } from "./user-manager";

const roleLabels = {
  learner: "Học viên",
  author: "Biên soạn viên",
  admin: "Quản trị viên",
};

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tài khoản</h1>
          <p className="mt-2">
            {user.firstName} · {user.username} · {roleLabels[user.role]}
          </p>
        </div>
        <SignOutButton />
      </section>
      {user.role !== "learner" && (
        <Link
          href="/author"
          className="inline-block font-bold text-sky-700 underline"
        >
          Mở công cụ biên soạn
        </Link>
      )}
      <PasswordForm />
      {user.role === "admin" && <UserManager currentUserId={user.id} />}
    </div>
  );
}
