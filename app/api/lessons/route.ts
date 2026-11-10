import db from "@/db/drizzle";
import { lessons } from "@/db/schema";
import { adminGuard, apiError, listResponse, advancedReadOnly } from "@/lib/admin-api";
export async function GET(request:Request) {
 try {await adminGuard(request); return listResponse(request,"lessons",await db.select().from(lessons));} catch(error) {return apiError(error);}
}
export const POST=advancedReadOnly;
