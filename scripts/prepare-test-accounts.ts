/** Synthetic fixtures only. Refuses non-test database names. Never use for production. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { hashPassword } from "../lib/password";

async function main() {
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString || !new URL(connectionString).pathname.includes("test")) throw new Error("Fixture chỉ được dùng trên DB có tên chứa test.");
  const pool=new Pool({connectionString});
  try {
    const password=randomBytes(24).toString("base64url");
    const passwordHash=await hashPassword(password);
    const fixture: Record<string,string>={password};
    for(const role of ["admin","author","learner"]) {
      const username=`demo_${role}`;
      await pool.query("INSERT INTO users(id,username,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,active=true",[randomUUID(),username,`Demo ${role}`,passwordHash,role]);
      await pool.query("DELETE FROM login_attempts WHERE username=$1",[username]);
      fixture[role]=username;
    }
    await mkdir("work",{recursive:true});
    await writeFile("work/test-accounts.json",JSON.stringify(fixture),{mode:0o600});
    console.log("Đã tạo 3 tài khoản giả; mật khẩu chỉ lưu trong work/test-accounts.json không theo dõi Git.");
  } finally {await pool.end();}
}
main().catch(()=>{console.error("Không tạo được fixture; kiểm tra DB test/migration.");process.exitCode=1;});
