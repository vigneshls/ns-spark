import { prisma } from "@/lib/db";
import { projectScope, type SessionUser } from "@/lib/auth";
import { STATUS as S } from "@/lib/workflow/machine";

export interface Table { title: string; columns: string[]; rows: (string | number)[][] }
export interface Filters { institution?: string; department?: string; status?: string; q?: string; from?: string; to?: string; view?: string }

const d = (x?: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
const APPROVED = [S.FINAL_APPROVED, S.IN_REGISTER, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START, S.ONGOING, S.ON_HOLD, S.COMPLETED];

export const REPORTS: Record<string, string> = {
  projects: "Project Register", approved: "Approved Project Report", rejected: "Rejected Project Report",
  initial_pending: "Initial Approval Pending Report", final_pending: "Final Approval Pending Report",
  allocation: "Faculty & Student Allocation Report", financial: "Project Financial Report",
  student_timesheets: "Daily Student Timesheet Report", faculty_timesheets: "Daily Faculty Timesheet Report",
  contribution: "Faculty & Student Contribution Report", milestones: "Project Milestone Report",
  delayed: "Delayed Project Report", completed: "Completed Project Report", progress: "Daily / Weekly Progress Report",
};

export async function buildReport(key: string, u: SessionUser, f: Filters): Promise<Table | null> {
  if (!REPORTS[key]) return null;
  const range = f.from || f.to ? { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to + "T23:59:59Z") } : {}) } : undefined;
  // scope sits inside AND so report filters can never widen it
  const base: Record<string, unknown> = { AND: [{ deletedAt: null, ...projectScope(u) }] };
  if (f.institution) base.institutionId = f.institution;
  if (f.department) base.departmentId = f.department;
  if (f.q) base.OR = [{ code: { contains: f.q } }, { title: { contains: f.q } }, { client: { name: { contains: f.q } } }];
  const title = REPORTS[key];
  const withStatus = (st?: string[]) => ({ ...base, ...(f.status ? { status: f.status } : st ? { status: { in: st } } : {}) });
  const proj = (rows: Awaited<ReturnType<typeof prisma.project.findMany<{ include: { institution: true; department: true; client: true } }>>>): Table => ({
    title, columns: ["Project ID", "Title", "Client", "Institution", "Department", "Status", "Registered"],
    rows: rows.map((p) => [p.code, p.title, p.client.name, p.institution.code, p.department?.name ?? "", p.status, d(p.createdAt)]),
  });
  const inc = { institution: true, department: true, client: true } as const;
  const list = (where: object) => prisma.project.findMany({ where: { ...where, ...(range ? { createdAt: range } : {}) }, orderBy: { createdAt: "desc" }, include: inc });

  switch (key) {
    case "projects": return proj(await list(withStatus()));
    case "approved": return proj(await list(withStatus(APPROVED)));
    case "rejected": return proj(await list(withStatus([S.REJECTED, S.CANCELLED])));
    case "initial_pending": return proj(await list(withStatus([S.REGISTERED, S.INITIAL_REVIEW, S.PENDING_PRINCIPAL_INITIAL, S.PENDING_SECRETARY_INITIAL])));
    case "final_pending": return proj(await list(withStatus([S.PROPOSAL_SUBMITTED, S.PROPOSAL_REVIEW, S.PENDING_PRINCIPAL_FINAL, S.PENDING_SECRETARY_FINAL])));
    case "completed": return proj(await list(withStatus([S.COMPLETED])));
    case "delayed": return proj(await list({ ...base, status: S.ONGOING, expectedEnd: { lt: new Date() } }));
    case "allocation": {
      const m = await prisma.projectMember.findMany({ where: { active: true, project: base }, include: { user: true, project: true }, orderBy: { allocatedAt: "desc" } });
      return { title, columns: ["Project ID", "Project", "Name", "ID / Reg. No", "Type", "Role", "Allocated"], rows: m.map((x) => [x.project.code, x.project.title, x.user.name, x.user.employeeId ?? x.user.registerNo ?? "", x.kind, x.role ?? "", d(x.allocatedAt)]) };
    }
    case "financial": {
      const ps = await prisma.project.findMany({ where: base, include: { ...inc, proposals: { where: { state: { in: ["SUBMITTED", "APPROVED"] } }, orderBy: { version: "desc" }, take: 1 } } });
      return { title, columns: ["Project ID", "Title", "Institution", "Client Budget", "Estimated Cost", "Quotation", "Status"], rows: ps.map((p) => [p.code, p.title, p.institution.code, p.expectedBudget ?? "", p.proposals[0]?.totalCost ?? "", p.proposals[0]?.quotation ?? "", p.status]) };
    }
    case "student_timesheets": case "faculty_timesheets": {
      const ts = await prisma.timesheet.findMany({ where: { kind: key === "student_timesheets" ? "STUDENT" : "FACULTY", project: base, ...(range ? { date: range } : {}) }, include: { user: true, project: true }, orderBy: { date: "desc" } });
      return { title, columns: ["Date", "Project ID", "Name", "Work", "Hours", "Progress %", "Status"], rows: ts.map((t) => [d(t.date), t.project.code, t.user.name, t.work, t.hours, t.progress ?? "", t.status]) };
    }
    case "contribution": {
      const g = await prisma.timesheet.groupBy({ by: ["userId", "kind"], where: { status: { in: ["FACULTY_APPROVED", "HOD_APPROVED"] }, project: base, ...(range ? { date: range } : {}) }, _sum: { hours: true }, _count: true });
      const users = await prisma.user.findMany({ where: { id: { in: g.map((x) => x.userId) } } });
      return { title, columns: ["Name", "Type", "Approved Entries", "Total Hours"], rows: g.map((x) => [users.find((y) => y.id === x.userId)?.name ?? "", x.kind, x._count, x._sum.hours ?? 0]) };
    }
    case "milestones": {
      const ms = await prisma.milestone.findMany({ where: { project: base }, include: { project: true }, orderBy: { dueDate: "asc" } });
      return { title, columns: ["Project ID", "Milestone", "Due", "Completed", "State"], rows: ms.map((m) => [m.project.code, m.title, d(m.dueDate), d(m.doneAt), m.doneAt ? "Done" : m.dueDate < new Date() ? "Overdue" : "Open"]) };
    }
    case "progress": {
      const r = await prisma.dailyReport.findMany({ where: { project: base, ...(range ? { forDate: range } : {}) }, include: { project: true }, orderBy: { forDate: "desc" } });
      return { title, columns: ["Date", "Period", "Project ID", "Summary", "Status", "NS Spark Remarks"], rows: r.map((x) => [d(x.forDate), x.period, x.project.code, x.summary, x.status, x.nsRemarks ?? ""]) };
    }
  }
  return null;
}
