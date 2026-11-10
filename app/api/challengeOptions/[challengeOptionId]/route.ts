import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { challengeOptions } from "@/db/schema";
import { adminGuard, apiError, positiveId, advancedReadOnly } from "@/lib/admin-api";
type Context={params:Promise<{challengeOptionId:string}>};
export async function GET(request:Request,context:Context) {
 try {await adminGuard(request); const id=positiveId((await context.params).challengeOptionId); const [record]=await db.select().from(challengeOptions).where(eq(challengeOptions.id,id)); return record?Response.json(record):Response.json({error:"Không tìm thấy."},{status:404});}catch(error){return apiError(error);}
}
export const PUT=advancedReadOnly;
export const DELETE=advancedReadOnly;
