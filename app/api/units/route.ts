import db from "@/db/drizzle";
import { units } from "@/db/schema";
import { adminGuard, apiError, listResponse, advancedReadOnly } from "@/lib/admin-api";
export async function GET(request:Request) {
 try {await adminGuard(request); return listResponse(request,"units",await db.select().from(units));} catch(error) {return apiError(error);}
}
export const POST=advancedReadOnly;
