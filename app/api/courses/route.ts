import db from "@/db/drizzle";
import { courses } from "@/db/schema";
import { adminGuard, apiError, listResponse, advancedReadOnly } from "@/lib/admin-api";
export async function GET(request:Request) {
 try {await adminGuard(request); return listResponse(request,"courses",await db.select().from(courses));} catch(error) {return apiError(error);}
}
export const POST=advancedReadOnly;
