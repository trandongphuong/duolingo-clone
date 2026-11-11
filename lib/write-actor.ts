import { eq } from "drizzle-orm";

import { localUsers } from "@/db/auth-schema";
import type db from "@/db/drizzle";

type WriteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type WriteActor = { id: string; role: string };

export class ActorWriteError extends Error {
  readonly status = 403;

  constructor() {
    super("Tài khoản đã bị khóa hoặc thay đổi quyền. Vui lòng đăng nhập lại.");
  }
}

/** Keep authorization stable until commit, including requests parsed before revocation. */
export async function lockAuthorWriteActor(
  tx: WriteTransaction,
  actor: WriteActor
) {
  // Take the actor lock before content locks. Account role/active updates need an
  // exclusive lock on the same row, so a writer either commits before revocation
  // or waits and then checks the newly committed authorization state.
  const [current] = await tx
    .select({ role: localUsers.role, active: localUsers.active })
    .from(localUsers)
    .where(eq(localUsers.id, actor.id))
    .for("share");
  if (
    !current?.active ||
    current.role !== actor.role ||
    (current.role !== "author" && current.role !== "admin")
  ) {
    throw new ActorWriteError();
  }
}
