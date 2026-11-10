import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { currentUser } from "@/lib/auth";
import { PasswordInputError } from "@/lib/password";
import { assertSameOrigin } from "@/lib/security";
import { UserManagementError } from "@/lib/user-policy";
import { createUser, listUsers } from "@/lib/users";

export const GET = async () => {
  const actor = await currentUser();
  if (!actor)
    return NextResponse.json({ error: "Cần đăng nhập." }, { status: 401 });
  if (actor.role !== "admin")
    return NextResponse.json(
      { error: "Không có quyền quản trị tài khoản." },
      { status: 403 }
    );
  return NextResponse.json(await listUsers(actor));
};

export const POST = async (request: Request) => {
  const actor = await currentUser();
  if (!actor)
    return NextResponse.json({ error: "Cần đăng nhập." }, { status: 401 });
  if (actor.role !== "admin")
    return NextResponse.json(
      { error: "Không có quyền quản trị tài khoản." },
      { status: 403 }
    );
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Yêu cầu khác nguồn bị từ chối." },
      { status: 403 }
    );
  }
  try {
    return NextResponse.json(await createUser(actor, await request.json()), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof UserManagementError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Dữ liệu tài khoản không hợp lệ." },
        { status: 400 }
      );
    if (error instanceof PasswordInputError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("account.createFailed");
    return NextResponse.json(
      { error: "Không thể tạo tài khoản." },
      { status: 500 }
    );
  }
};
