import db from "@/db/drizzle";
import { challenges } from "@/db/schema";
import { adminGuard, apiError, listResponse, advancedReadOnly } from "@/lib/admin-api";
export async function GET(request:Request) {
 try {await adminGuard(request); return listResponse(request,"challenges",await db.select().from(challenges));} catch(error) {return apiError(error);}
}
export const POST=advancedReadOnly;
