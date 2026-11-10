import Link from "next/link";
import type { courses } from "@/db/schema";
type Props = {activeCourse: typeof courses.$inferSelect; hearts: number; points: number; hasActiveSubscription: boolean};
export const UserProgress = ({activeCourse, points}: Props) => <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><Link href="/courses" className="font-semibold text-sky-800">{activeCourse.title}</Link><Link href="/progress" className="whitespace-nowrap text-slate-600">{points} điểm</Link></div>;
