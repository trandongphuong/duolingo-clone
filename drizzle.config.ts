import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
dotenv.config({path:".env.local",quiet:true});
export default defineConfig({schema:"./db/schema.ts",out:"./drizzle",dialect:"postgresql",dbCredentials:{url:process.env.DATABASE_URL ?? "postgresql://localhost/hanngubien"}});
