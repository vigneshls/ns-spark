"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { WorkflowError } from "@/lib/workflow/machine";
import * as P from "@/lib/services/projects";
import { saveTimesheet, reviewStudentTimesheet, hodReviewTimesheet, consolidateDailyReport, forwardReport } from "@/lib/services/timesheets";
import { prisma } from "@/lib/db";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => s(f, k) || undefined;
const num = (f: FormData, k: string) => (s(f, k) ? Number(s(f, k)) : undefined);

/** Runs a use-case, then redirects back with ?ok= or ?err= (WorkflowError text is user-safe). */
async function run(back: string, fn: () => Promise<unknown>, ok = "Done") {
  let to: string;
  try { await fn(); to = `${back}${back.includes("?") ? "&" : "?"}ok=${encodeURIComponent(ok)}`; }
  catch (e) {
    if (!(e instanceof WorkflowError) && !(e as { code?: string })?.code?.startsWith?.("P2")) throw e;
    to = `${back}${back.includes("?") ? "&" : "?"}err=${encodeURIComponent(e instanceof WorkflowError ? e.message : "Database constraint violated")}`;
  }
  revalidatePath("/", "layout");
  redirect(to);
}

export async function createProject(f: FormData) {
  const u = await requireUser(["NS_SPARK"]);
  let id = "";
  try {
    const p = await P.registerProject(u, {
      name: s(f, "c_name"), orgType: s(f, "c_type"), contactName: s(f, "c_contact"), designation: s(f, "c_desig"), mobile: s(f, "c_mobile"),
      email: s(f, "c_email"), address: s(f, "c_address"), city: s(f, "c_city"), state: s(f, "c_state"), country: s(f, "c_country"), website: opt(f, "c_web"),
    }, {
      institutionId: s(f, "institutionId"), title: s(f, "title"), category: s(f, "category"), description: s(f, "description"), requirements: s(f, "requirements"),
      problem: s(f, "problem"), deliverables: s(f, "deliverables"), preferredTech: opt(f, "preferredTech"), expectedBudget: num(f, "expectedBudget"),
      expectedDays: num(f, "expectedDays"), expectedEnd: opt(f, "expectedEnd") ? new Date(s(f, "expectedEnd")) : undefined, expectations: opt(f, "expectations"), remarks: opt(f, "remarks"),
    });
    id = p.id;
  } catch (e) {
    if (e instanceof WorkflowError) redirect(`/projects/new?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/projects/${id}?ok=Project+registered+as+draft`);
}

export async function doTransition(f: FormData) {
  const u = await requireUser();
  const id = s(f, "id");
  const { transition } = await import("@/lib/services/workflow");
  const commence = opt(f, "commencedAt");
  await run(`/projects/${id}`, () => transition(id, s(f, "action"), u, opt(f, "remarks"), commence ? { commencedAt: new Date(commence) } : {}), "Status updated");
}
export async function verifyClientAction(f: FormData) { const u = await requireUser(); const id = s(f, "id"); await run(`/projects/${id}`, () => P.verifyClient(u, id), "Client verified and frozen"); }
export async function assignDeptAction(f: FormData) { const u = await requireUser(); const id = s(f, "id"); await run(`/projects/${id}`, () => P.assignDepartment(u, id, s(f, "departmentId"), opt(f, "remarks")), "Department assigned"); }
export async function assignCoordAction(f: FormData) { const u = await requireUser(); const id = s(f, "id"); await run(`/projects/${id}`, () => P.assignCoordinator(u, id, s(f, "facultyId")), "Coordinator assigned"); }
export async function allocateAction(f: FormData) {
  const u = await requireUser(); const id = s(f, "id");
  await run(`/projects/${id}`, () => P.allocateMember(u, id, s(f, "userId"), s(f, "kind") as "FACULTY" | "STUDENT", opt(f, "role"), opt(f, "responsibility")), "Member allocated");
}
export async function saveProposalAction(f: FormData) {
  const u = await requireUser(); const id = s(f, "id");
  const keys = ["understanding", "feasibility", "solution", "scope", "objectives", "deliverables", "challenges", "facultyCount", "studentCount", "facultyExpertise", "studentSkills", "teamStructure",
    "stack", "languages", "frameworks", "databases", "hardware", "software", "tools", "infra", "startDate", "duration", "endDate", "workingDays", "milestones", "tasks",
    "costFaculty", "costStudent", "costHardware", "costSoftware", "costInfra", "costOther", "risks", "mitigation", "deptRemarks"];
  const content = Object.fromEntries(keys.map((k) => [k, s(f, k)]));
  const total = ["costFaculty", "costStudent", "costHardware", "costSoftware", "costInfra", "costOther"].reduce((a, k) => a + (Number(content[k]) || 0), 0);
  await run(`/projects/${id}`, () => P.saveProposal(u, id, content, total, num(f, "quotation")), "Proposal draft saved");
}
export async function addMilestoneAction(f: FormData) {
  const u = await requireUser(); const id = s(f, "id");
  await run(`/projects/${id}`, async () => {
    const p = await prisma.project.findUniqueOrThrow({ where: { id } });
    if (!(u.role === "HOD" && u.departmentId === p.departmentId) && !(u.role === "FACULTY" && p.coordinatorId === u.id)) throw new WorkflowError("Not authorized");
    await prisma.milestone.create({ data: { projectId: id, title: s(f, "title"), dueDate: new Date(s(f, "dueDate")) } });
  }, "Milestone added");
}
export async function completeMilestoneAction(f: FormData) {
  const u = await requireUser(); const id = s(f, "id");
  await run(`/projects/${id}`, async () => {
    const p = await prisma.project.findUniqueOrThrow({ where: { id } });
    if (!(u.role === "HOD" && u.departmentId === p.departmentId) && !(u.role === "FACULTY" && p.coordinatorId === u.id)) throw new WorkflowError("Not authorized");
    await prisma.milestone.update({ where: { id: s(f, "milestoneId") }, data: { doneAt: new Date(), percent: 100 } });
  }, "Milestone completed");
}

export async function saveTimesheetAction(f: FormData) {
  const u = await requireUser(); const pid = s(f, "projectId");
  await run("/timesheets", () => saveTimesheet(u, pid, new Date(s(f, "date")), {
    work: s(f, "work"), tasksDone: opt(f, "tasksDone"), hours: Number(s(f, "hours")), progress: num(f, "progress"), issues: opt(f, "issues"), nextPlan: opt(f, "nextPlan"), evidence: opt(f, "evidence"),
  }, s(f, "intent") === "submit"), s(f, "intent") === "submit" ? "Timesheet submitted" : "Draft saved");
}
export async function facultyReviewAction(f: FormData) { const u = await requireUser(); await run("/timesheets", () => reviewStudentTimesheet(u, s(f, "id"), s(f, "decision") as never, opt(f, "remarks")), "Review recorded"); }
export async function hodReviewAction(f: FormData) { const u = await requireUser(); await run("/timesheets", () => hodReviewTimesheet(u, s(f, "id"), s(f, "decision") as never, opt(f, "remarks")), "Review recorded"); }
export async function consolidateAction(f: FormData) { const u = await requireUser(); await run("/timesheets", () => consolidateDailyReport(u, s(f, "projectId"), new Date(s(f, "date")), s(f, "period") as never), "Report sent to NS Spark"); }
export async function forwardReportAction(f: FormData) { const u = await requireUser(); await run("/timesheets", () => forwardReport(u, s(f, "id"), opt(f, "remarks")), "Report forwarded to Principal and Secretary"); }

export async function markNotificationsRead() {
  const u = await requireUser();
  await prisma.notification.updateMany({ where: { userId: u.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout"); redirect("/notifications");
}
