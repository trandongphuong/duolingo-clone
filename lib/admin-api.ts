import { currentUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/security";

export async function adminGuard(request: Request, write = false) {
  const user = await currentUser();
  if (!user) throw Response.json({error:"Cần đăng nhập."}, {status:401});
  if (user.role !== "admin") throw Response.json({error:"Cần quyền quản trị."}, {status:403});
  if (write) { try { assertSameOrigin(request); } catch { throw Response.json({error:"Yêu cầu khác nguồn bị từ chối."}, {status:403}); } }
  return user;
}
export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({error:"Dữ liệu không hợp lệ hoặc thao tác không được phép."}, {status:400});
}
export function positiveId(value: unknown) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("ID không hợp lệ");
  return id;
}
export function listResponse<T extends {id:number}>(request: Request, resource: string, records: T[]) {
  const params = new URL(request.url).searchParams;
  const filter = JSON.parse(params.get("filter") || "{}") as Record<string,unknown>;
  let rows = records;
  for (const [key, value] of Object.entries(filter)) {
    rows = rows.filter(row => {
      const actual = row[key as keyof T];
      return Array.isArray(value) ? value.includes(actual) : String(actual) === String(value);
    });
  }
  const [sort, direction] = JSON.parse(params.get("sort") || '["id","ASC"]') as [keyof T,string];
  rows.sort((a,b) => (String(a[sort]).localeCompare(String(b[sort]), "vi", {numeric:true})) * (direction === "DESC" ? -1 : 1));
  const [start,end] = JSON.parse(params.get("range") || "[0,999]") as number[];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end<start || end-start>5000) throw new Error("Khoảng không hợp lệ");
  const selected = rows.slice(start,end+1);
  return Response.json(selected, {headers:{"Content-Range":`${resource} ${start}-${start+Math.max(0,selected.length-1)}/${rows.length}`,"Cache-Control":"no-store"}});
}

export async function advancedReadOnly(request:Request) {
 try {await adminGuard(request,true); return Response.json({error:"Quản trị nâng cao chỉ đọc để bảo toàn lịch sử. Dùng Biên soạn để tạo/sửa/duyệt phiên bản."},{status:409});} catch(error) {return apiError(error);}
}
