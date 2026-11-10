import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { currentUser } from "@/lib/auth";
import { PasswordInputError } from "@/lib/password";
import { assertSameOrigin } from "@/lib/security";
import { UserManagementError } from "@/lib/user-policy";
import { updateUser } from "@/lib/users";

export const PATCH = async (
  request: Request,
  context: { params: Promise<{ userId: string }> }
) => {
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
    const { userId } = await context.params;
    return NextResponse.json(
      await updateUser(actor, userId, await request.json())
    );
  } catch (error) {
    if (error instanceof UserManagementError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Dữ liệu cập nhật không hợp lệ." },
        { status: 400 }
      );
    if (error instanceof PasswordInputError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("account.updateFailed");
    return NextResponse.json(
      { error: "Không thể cập nhật tài khoản." },
      { status: 500 }
    );
  }
};
