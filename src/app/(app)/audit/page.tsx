import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, label } from "@/components/ui";

export default async function Audit() {
  await requireUser(["ADMIN", "NS_SPARK"]);
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { user: true } });
  const projects = await prisma.project.findMany({ where: { id: { in: rows.map((r) => r.projectId).filter(Boolean) as string[] } }, select: { id: true, code: true } });
  const code = new Map(projects.map((p) => [p.id, p.code]));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <Card><div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="text-left text-slate-500"><th className="py-1">Time</th><th>User</th><th>Role</th><th>Action</th><th>Project</th><th>Status change</th><th>Remarks</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t align-top"><td className="py-1 whitespace-nowrap">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td><td>{r.user?.name ?? "—"}</td><td>{r.role ? label(r.role) : ""}</td>
            <td>{label(r.action)}</td><td>{r.projectId ? code.get(r.projectId) : ""}</td><td>{r.prevStatus ? `${label(r.prevStatus)} → ${label(r.newStatus ?? "")}` : ""}</td><td>{r.remarks}</td></tr>))}</tbody>
      </table></div></Card>
    </div>
  );
}
