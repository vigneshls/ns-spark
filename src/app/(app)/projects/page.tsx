import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, projectScope } from "@/lib/auth";
import { STATUS as S } from "@/lib/workflow/machine";
import { Badge, Card, inputCls, btnGhost, label } from "@/components/ui";

const APPROVED = [S.FINAL_APPROVED, S.IN_REGISTER, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START, S.ONGOING, S.ON_HOLD, S.COMPLETED];

export default async function Projects({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  // scope sits inside AND so user-supplied filters can never widen it
  const where: Record<string, unknown> = { AND: [{ deletedAt: null, ...projectScope(u) }] };
  if (sp.view === "approved") where.status = { in: APPROVED };
  if (sp.view === "pending") where.status = { in: u.role === "PRINCIPAL" ? [S.PENDING_PRINCIPAL_INITIAL, S.PENDING_PRINCIPAL_FINAL] : [S.PENDING_SECRETARY_INITIAL, S.PENDING_SECRETARY_FINAL] };
  if (sp.status) where.status = sp.status;
  if (sp.institution) where.institutionId = sp.institution;
  if (sp.department) where.departmentId = sp.department;
  if (sp.q) where.OR = [{ code: { contains: sp.q } }, { title: { contains: sp.q } }, { client: { name: { contains: sp.q } } }];
  const [rows, insts, depts] = await Promise.all([
    prisma.project.findMany({ where, orderBy: { createdAt: "desc" }, include: { institution: true, department: true, client: true } }),
    prisma.institution.findMany(), prisma.department.findMany({ where: { deletedAt: null } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">{sp.view === "approved" ? "Approved Projects Register" : sp.view === "pending" ? "Pending Approvals" : "Projects"}</h1>
        <div className="flex gap-2">
          {["ADMIN", "NS_SPARK", "HOD", "PRINCIPAL", "SECRETARY"].includes(u.role) && <a className={btnGhost} href={`/api/export/projects?${qs}`}>Export Excel</a>}
          {u.role === "NS_SPARK" && <Link className="px-3 py-1.5 rounded-md text-sm text-white bg-indigo-600" href="/projects/new">+ Register Project</Link>}
        </div>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search" className={inputCls + " max-w-xs"} />
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <select name="institution" defaultValue={sp.institution ?? ""} className={inputCls + " max-w-xs"}><option value="">All institutions</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <select name="department" defaultValue={sp.department ?? ""} className={inputCls + " max-w-xs"}><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className={inputCls + " max-w-xs"}><option value="">All statuses</option>{Object.values(S).map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
        <button className={btnGhost}>Filter</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Project ID</th><th>Title</th><th>Client</th><th>Institution</th><th>Department</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t"><td className="py-2 font-mono text-xs">{p.code}</td><td>{p.title}</td><td>{p.client.name}</td><td>{p.institution.code}</td>
                  <td>{p.department?.name ?? "—"}</td><td><Badge s={p.status} /></td><td><Link className="text-indigo-600" href={`/projects/${p.id}`}>View</Link></td></tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="py-6 text-center text-slate-400">No projects match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
