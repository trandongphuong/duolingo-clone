export type UserRole = "learner" | "author" | "admin";
export type UserActor = { id: string; role: UserRole };

export class UserManagementError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export const requireAdminActor = (actor: UserActor) => {
  if (actor.role !== "admin")
    throw new UserManagementError("Không có quyền quản trị tài khoản.", 403);
};

export const validateAdminTransition = (
  actorId: string,
  target: { id: string; role: UserRole; active: boolean },
  next: { role: UserRole; active: boolean },
  activeAdminCount: number
) => {
  if (actorId === target.id && !next.active)
    throw new UserManagementError(
      "Không thể tự khóa tài khoản đang quản trị.",
      400
    );
  if (
    target.active &&
    target.role === "admin" &&
    (!next.active || next.role !== "admin") &&
    activeAdminCount <= 1
  ) {
    throw new UserManagementError(
      "Phải giữ ít nhất một quản trị viên đang hoạt động.",
      400
    );
  }
};
