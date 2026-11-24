import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, btnGhost } from "@/components/ui";
import { markNotificationsRead } from "../projects/actions";

export default async function Notifications() {
  const u = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-between"><h1 className="text-xl font-semibold">Notifications</h1>
        <form action={markNotificationsRead}><button className={btnGhost}>Mark all read</button></form></div>
      <Card>
        <ul className="text-sm">
          {items.map((n) => (
            <li key={n.id} className={`border-t first:border-0 py-2 ${n.read ? "text-slate-500" : "font-medium"}`}>
              {n.projectId ? <Link className="hover:underline" href={`/projects/${n.projectId}`}>{n.message}</Link> : n.message}
              <span className="block text-xs text-slate-400 font-normal">{n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            </li>))}
          {!items.length && <li className="text-slate-400">No notifications.</li>}
        </ul>
      </Card>
    </div>
  );
}
