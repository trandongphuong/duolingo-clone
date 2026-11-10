import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { App } from "./app";
export default async function AdminPage() { const user=await requireUser(); if(user.role!=="admin") redirect("/learn"); return <App />; }
