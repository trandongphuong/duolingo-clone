import dotenv from "dotenv";
import { resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";

async function main() {
dotenv.config({path:".env.local",quiet:true});
if (!process.env.DATABASE_URL) throw new Error("Cần cấu hình DATABASE_URL trước khi migrate.");
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const connection = await pool.connect();
try {
  await connection.query("SELECT pg_advisory_lock(19650109)");
  await connection.query("CREATE TABLE IF NOT EXISTS hnb_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const directory = resolve("drizzle");
  for (const file of (await readdir(directory)).filter(name=>name.endsWith(".sql")).sort()) {
    const sql = await readFile(resolve(directory,file),"utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await connection.query<{checksum:string}>("SELECT checksum FROM hnb_migrations WHERE name=$1",[file]);
    if(existing.rows[0]) {
      if(existing.rows[0].checksum !== checksum) throw new Error(`Migration đã thay đổi: ${file}`);
      console.log(`Đã áp dụng: ${file}`); continue;
    }
    await connection.query("BEGIN");
    try {
      await connection.query(sql);
      await connection.query("INSERT INTO hnb_migrations(name,checksum) VALUES($1,$2)",[file,checksum]);
      await connection.query("COMMIT");
      console.log(`Áp dụng thành công: ${file}`);
    } catch(error) { await connection.query("ROLLBACK"); throw error; }
  }
} finally {
  await connection.query("SELECT pg_advisory_unlock(19650109)");
  connection.release(); await pool.end();
}

}
main().catch(() => { console.error("Migration thất bại. Kiểm tra cấu hình/kết nối DB và migration, không in chuỗi kết nối."); process.exitCode=1; });
