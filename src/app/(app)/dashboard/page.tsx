import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, projectScope } from "@/lib/auth";
import { STATUS as S } from "@/lib/workflow/machine";
import { Badge, Bars, Card, Kpi, label } from "@/components/ui";

export default async function Dashboard() {
  const u = await requireUser();
  const scope = { deletedAt: null, ...projectScope(u) };
  const [grouped, recent, byInst, byDept, members] = await Promise.all([
    prisma.project.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.project.findMany({ where: scope, orderBy: { updatedAt: "desc" }, take: 8, include: { institution: true, department: true } }),
    prisma.project.findMany({ where: scope, select: { institution: { select: { code: true } } } }),
    prisma.project.findMany({ where: scope, select: { department: { select: { name: true } } } }),
    u.role === "FACULTY" || u.role === "HOD" ? prisma.projectMember.count({ where: { project: scope, kind: "STUDENT", active: true } }) : Promise.resolve(0),
  ]);
  const n = (...st: string[]) => grouped.filter((g) => st.includes(g.status)).reduce((a, g) => a + g._count, 0);
  const total = grouped.reduce((a, g) => a + g._count, 0);

  const [tsPendingFaculty, tsApproved, tsRejected, tsPendingHod, tsMine, delayed, overdueMs] = await Promise.all([
    prisma.timesheet.count({ where: { status: "SUBMITTED", kind: "STUDENT", project: { ...scope, ...(u.role === "FACULTY" ? { coordinatorId: u.id } : {}) } } }),
    prisma.timesheet.count({ where: { status: { in: ["FACULTY_APPROVED", "HOD_APPROVED"] }, ...(u.role === "STUDENT" ? { userId: u.id } : { project: scope }) } }),
    prisma.timesheet.count({ where: { status: { in: ["REJECTED", "CORRECTION", "HOD_RETURNED"] }, ...(u.role === "STUDENT" ? { userId: u.id } : { project: scope }) } }),
    prisma.timesheet.count({ where: { project: scope, OR: [{ kind: "STUDENT", status: "FACULTY_APPROVED" }, { kind: "FACULTY", status: "SUBMITTED" }] } }),
    prisma.timesheet.count({ where: { userId: u.id, status: { in: ["DRAFT", "CORRECTION", "REJECTED", "HOD_RETURNED"] } } }),
    prisma.project.count({ where: { ...scope, status: S.ONGOING, expectedEnd: { lt: new Date() } } }),
    prisma.milestone.count({ where: { project: scope, doneAt: null, dueDate: { lt: new Date() } } }),
  ]);

  const kpis: Record<string, [string, number, string?][]> = {
    NS_SPARK: [
      ["Total Projects Received", total, "/projects"], ["Under Initial Review", n(S.REGISTERED, S.INITIAL_REVIEW), "/projects?status=" + S.INITIAL_REVIEW],
      ["Pending Principal Approval", n(S.PENDING_PRINCIPAL_INITIAL, S.PENDING_PRINCIPAL_FINAL)], ["Pending Secretary Approval", n(S.PENDING_SECRETARY_INITIAL, S.PENDING_SECRETARY_FINAL)],
      ["Forwarded to Departments", n(S.FORWARDED_TO_DEPT)], ["Proposals Under Preparation", n(S.DEPT_ANALYSIS, S.PROPOSAL_DRAFT)],
      ["Proposals Under Review", n(S.PROPOSAL_SUBMITTED, S.PROPOSAL_REVIEW)], ["Approved Projects", n(S.FINAL_APPROVED, S.IN_REGISTER, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START, S.ONGOING, S.COMPLETED), "/projects?view=approved"],
      ["Ongoing", n(S.ONGOING)], ["Completed", n(S.COMPLETED)], ["Delayed", delayed], ["HOD-approved Reports to Review", await prisma.dailyReport.count({ where: { status: "HOD_APPROVED" } }), "/timesheets"],
    ],
    PRINCIPAL: [
      ["Initial Approvals Pending", n(S.PENDING_PRINCIPAL_INITIAL), "/projects?view=pending"], ["Final Proposal Approvals Pending", n(S.PENDING_PRINCIPAL_FINAL), "/projects?view=pending"],
      ["Approved Projects", n(S.FINAL_APPROVED, S.IN_REGISTER, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START, S.ONGOING, S.COMPLETED)], ["Under Execution", n(S.ONGOING)], ["Delayed / Attention", delayed + overdueMs],
    ],
    SECRETARY: [
      ["Awaiting Initial Approval", n(S.PENDING_SECRETARY_INITIAL), "/projects?view=pending"], ["Awaiting Final Approval", n(S.PENDING_SECRETARY_FINAL), "/projects?view=pending"],
      ["Approved Projects", n(S.FINAL_APPROVED, S.IN_REGISTER, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START, S.ONGOING, S.COMPLETED)], ["Ongoing", n(S.ONGOING)],
    ],
    HOD: [
      ["Department Projects", total, "/projects"], ["New Projects Received", n(S.FORWARDED_TO_DEPT)], ["Proposals in Progress", n(S.DEPT_ANALYSIS, S.PROPOSAL_DRAFT)],
      ["Pending Proposals Review", n(S.PROPOSAL_SUBMITTED, S.PROPOSAL_REVIEW, S.PENDING_PRINCIPAL_FINAL, S.PENDING_SECRETARY_FINAL)], ["Approved Projects", n(S.FINAL_APPROVED, S.IN_REGISTER, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START)],
      ["Ongoing", n(S.ONGOING)], ["Assigned Students", members], ["Pending Timesheet Reviews", tsPendingHod, "/timesheets"], ["Behind Schedule", delayed],
    ],
    FACULTY: [
      ["Assigned Projects", total, "/projects"], ["Assigned Students", members], ["Pending Student Timesheets", tsPendingFaculty, "/timesheets"],
      ["Approved Timesheets", tsApproved], ["Rejected / Correction", tsRejected], ["My Timesheets To Complete", tsMine, "/timesheets"], ["Overdue Milestones", overdueMs],
    ],
    STUDENT: [
      ["My Projects", total, "/projects"], ["Pending / To Correct", tsMine, "/timesheets"], ["Approved Timesheets", tsApproved], ["Rejected / Correction", tsRejected],
    ],
    ADMIN: [["Projects", total], ["Users", await prisma.user.count({ where: { deletedAt: null } })], ["Departments", await prisma.department.count()]],
  };

  const instData = Object.entries(byInst.reduce<Record<string, number>>((a, p) => ((a[p.institution.code] = (a[p.institution.code] ?? 0) + 1), a), {})).map(([name, n]) => ({ name, n }));
  const deptData = Object.entries(byDept.reduce<Record<string, number>>((a, p) => { const k = p.department?.name ?? "Unassigned"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([name, n]) => ({ name, n }));
  const statusData = grouped.map((g) => ({ name: label(g.status), n: g._count }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{label(u.role)} Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis[u.role].map(([t, v, h]) => <Kpi key={t} title={t} value={v} href={h} />)}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Status distribution"><Bars data={statusData} /></Card>
        <Card title="Institution-wise"><Bars data={instData} /></Card>
        <Card title="Department-wise"><Bars data={deptData} /></Card>
      </div>
      <Card title="Recent activity" right={<Link className="text-sm text-indigo-600" href="/projects">View all</Link>}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-1">ID</th><th>Title</th><th>Institution</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>
            {recent.map((p) => (
              <tr key={p.id} className="border-t"><td className="py-2"><Link className="text-indigo-600" href={`/projects/${p.id}`}>{p.code}</Link></td>
                <td>{p.title}</td><td>{p.institution.code}</td><td>{p.department?.name ?? "—"}</td><td><Badge s={p.status} /></td></tr>
            ))}
            {!recent.length && <tr><td colSpan={5} className="py-4 text-slate-400">No projects yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
