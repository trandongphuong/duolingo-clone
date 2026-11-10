import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { currentUser, endSession } from "@/lib/auth";
import { PasswordInputError } from "@/lib/password";
import { assertSameOrigin } from "@/lib/security";
import { UserManagementError } from "@/lib/user-policy";
import { changeOwnPassword } from "@/lib/users";

export const POST = async (request: Request) => {
  const actor = await currentUser();
  if (!actor)
    return NextResponse.json({ error: "Cần đăng nhập." }, { status: 401 });
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Yêu cầu khác nguồn bị từ chối." },
      { status: 403 }
    );
  }
  try {
    await changeOwnPassword(actor, await request.json());
    await endSession();
    return NextResponse.json({
      message:
        "Đã đổi mật khẩu và đăng xuất mọi phiên. Vui lòng đăng nhập lại.",
    });
  } catch (error) {
    if (error instanceof UserManagementError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Kiểm tra dữ liệu mật khẩu." },
        { status: 400 }
      );
    if (error instanceof PasswordInputError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("account.passwordChangeFailed");
    return NextResponse.json(
      { error: "Không thể đổi mật khẩu." },
      { status: 500 }
    );
  }
};
