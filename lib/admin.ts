import { currentUser } from "@/lib/auth";

export const getIsAdmin = async () => (await currentUser())?.role === "admin";
