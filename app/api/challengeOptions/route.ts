import db from "@/db/drizzle";
import { challengeOptions } from "@/db/schema";
import { adminGuard, apiError, listResponse, advancedReadOnly } from "@/lib/admin-api";
export async function GET(request:Request) {
 try {await adminGuard(request); return listResponse(request,"challengeOptions",await db.select().from(challengeOptions));} catch(error) {return apiError(error);}
}
export const POST=advancedReadOnly;
