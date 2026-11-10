import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { units } from "@/db/schema";
import { adminGuard, apiError, positiveId, advancedReadOnly } from "@/lib/admin-api";
type Context={params:Promise<{unitId:string}>};
export async function GET(request:Request,context:Context) {
 try {await adminGuard(request); const id=positiveId((await context.params).unitId); const [record]=await db.select().from(units).where(eq(units.id,id)); return record?Response.json(record):Response.json({error:"Không tìm thấy."},{status:404});}catch(error){return apiError(error);}
}
export const PUT=advancedReadOnly;
export const DELETE=advancedReadOnly;
