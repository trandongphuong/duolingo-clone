import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { courses } from "@/db/schema";
import { adminGuard, apiError, positiveId, advancedReadOnly } from "@/lib/admin-api";
type Context={params:Promise<{courseId:string}>};
export async function GET(request:Request,context:Context) {
 try {await adminGuard(request); const id=positiveId((await context.params).courseId); const [record]=await db.select().from(courses).where(eq(courses.id,id)); return record?Response.json(record):Response.json({error:"Không tìm thấy."},{status:404});}catch(error){return apiError(error);}
}
export const PUT=advancedReadOnly;
export const DELETE=advancedReadOnly;
