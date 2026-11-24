import { prisma } from "@/lib/db";
import { audit, notify, type Actor } from "./workflow";
import { WorkflowError, STATUS } from "@/lib/workflow/machine";

const day = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

export interface TimesheetInput { work: string; tasksDone?: string; hours: number; progress?: number; issues?: string; nextPlan?: string; evidence?: string }

/** Student (kind STUDENT) or faculty (kind FACULTY) own entry. Draft or submit. */
export async function saveTimesheet(actor: Actor, projectId: string, date: Date, input: TimesheetInput, submit: boolean) {
  const kind = actor.role === "STUDENT" ? "STUDENT" : actor.role === "FACULTY" ? "FACULTY" : null;
  if (!kind) throw new WorkflowError("Only students and faculty submit timesheets");
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (p.status !== STATUS.ONGOING || !p.commencedAt) throw new WorkflowError("Timesheets are enabled only for ongoing projects");
  const d = day(date);
  if (d < day(p.commencedAt)) throw new WorkflowError("Timesheet date is before the project's commencement date");
  if (d > day(new Date())) throw new WorkflowError("Future-dated timesheets are not allowed");
  if (input.hours <= 0 || input.hours > 24) throw new WorkflowError("Hours must be between 0 and 24");
  const m = await prisma.projectMember.findFirst({ where: { projectId, userId: actor.id, active: true } });
  if (!m) throw new WorkflowError("You are not allocated to this project");

  const existing = await prisma.timesheet.findUnique({ where: { projectId_userId_date_kind: { projectId, userId: actor.id, date: d, kind } } });
  if (existing && !["DRAFT", "CORRECTION", "REJECTED", "HOD_RETURNED"].includes(existing.status))
    throw new WorkflowError("A timesheet for this date was already submitted");
  const status = submit ? "SUBMITTED" : "DRAFT";
  const data = { ...input, status, submittedAt: submit ? new Date() : null };
  const ts = existing
    ? await prisma.timesheet.update({ where: { id: existing.id }, data })
    : await prisma.timesheet.create({ data: { projectId, userId: actor.id, kind, date: d, ...data } });
  if (submit) {
    await prisma.$transaction(async (tx) => {
      await audit(tx, { actor, action: `${kind.toLowerCase()}_timesheet_submitted`, projectId });
      // student sheets go to the coordinator; faculty sheets go straight to the HOD queue
      const to = kind === "STUDENT" ? (p.coordinatorId ? [p.coordinatorId] : [])
        : (await tx.user.findMany({ where: { role: "HOD", departmentId: p.departmentId ?? "" }, select: { id: true } })).map((u) => u.id);
      await notify(tx, to, projectId, `${p.code}: ${kind.toLowerCase()} timesheet submitted for ${d.toISOString().slice(0, 10)}`, actor.id);
    });
  }
  return ts;
}

export async function reviewStudentTimesheet(actor: Actor, id: string, decision: "APPROVED" | "REJECTED" | "CORRECTION", remarks?: string) {
  const ts = await prisma.timesheet.findUniqueOrThrow({ where: { id }, include: { project: true } });
  if (ts.kind !== "STUDENT" || ts.status !== "SUBMITTED") throw new WorkflowError("Not a submitted student timesheet");
  if (actor.role !== "FACULTY" || ts.project.coordinatorId !== actor.id) throw new WorkflowError("Only the project coordinator can verify");
  if (decision !== "APPROVED" && !remarks?.trim()) throw new WorkflowError("Remarks are mandatory");
  const status = decision === "APPROVED" ? "FACULTY_APPROVED" : decision;
  await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({ where: { id }, data: { status } });
    await tx.timesheetReview.create({ data: { timesheetId: id, level: "FACULTY", decision, remarks, userId: actor.id } });
    await audit(tx, { actor, action: `faculty_${decision.toLowerCase()}_timesheet`, projectId: ts.projectId, remarks });
    await notify(tx, [ts.userId], ts.projectId, `${ts.project.code}: your timesheet was ${decision.toLowerCase()}`, actor.id);
  });
}

/** HOD reviews faculty-approved student sheets and faculty sheets for own department. */
export async function hodReviewTimesheet(actor: Actor, id: string, decision: "APPROVED" | "REJECTED" | "CORRECTION", remarks?: string) {
  const ts = await prisma.timesheet.findUniqueOrThrow({ where: { id }, include: { project: true } });
  const ready = ts.kind === "STUDENT" ? ts.status === "FACULTY_APPROVED" : ts.status === "SUBMITTED";
  if (!ready) throw new WorkflowError("Timesheet is not ready for HOD review");
  if (actor.role !== "HOD" || actor.departmentId !== ts.project.departmentId) throw new WorkflowError("Not your department");
  if (decision !== "APPROVED" && !remarks?.trim()) throw new WorkflowError("Remarks are mandatory");
  await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({ where: { id }, data: { status: decision === "APPROVED" ? "HOD_APPROVED" : "HOD_RETURNED" } });
    await tx.timesheetReview.create({ data: { timesheetId: id, level: "HOD", decision, remarks, userId: actor.id } });
    await audit(tx, { actor, action: `hod_${decision.toLowerCase()}_timesheet`, projectId: ts.projectId, remarks });
    await notify(tx, [ts.userId], ts.projectId, `${ts.project.code}: HOD ${decision.toLowerCase()} your timesheet`, actor.id);
  });
}

/** HOD consolidates a day's approved sheets into a report for NS Spark. */
export async function consolidateDailyReport(actor: Actor, projectId: string, date: Date, period: "DAILY" | "WEEKLY" = "DAILY") {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (actor.role !== "HOD" || actor.departmentId !== p.departmentId) throw new WorkflowError("Not your department");
  const from = day(date);
  const to = new Date(from.getTime() + (period === "DAILY" ? 1 : 7) * 86400000);
  const sheets = await prisma.timesheet.findMany({ where: { projectId, status: "HOD_APPROVED", date: { gte: from, lt: to } }, include: { user: true } });
  if (!sheets.length) throw new WorkflowError("No HOD-approved timesheets in this period");
  const hours = sheets.reduce((s, t) => s + t.hours, 0);
  const summary = `${sheets.length} approved timesheets, ${hours.toFixed(1)} hours. ` + sheets.map((t) => `${t.user.name}: ${t.work}`).join(" | ");
  return prisma.$transaction(async (tx) => {
    const r = await tx.dailyReport.create({ data: { projectId, period, forDate: from, summary } });
    const ns = await tx.user.findMany({ where: { role: "NS_SPARK" }, select: { id: true } });
    await notify(tx, ns.map((u) => u.id), projectId, `${p.code}: ${period.toLowerCase()} report approved by HOD`, actor.id);
    await audit(tx, { actor, action: "consolidate_report", projectId });
    return r;
  });
}

/** NS Spark reviews and forwards to Principal and Secretary. */
export async function forwardReport(actor: Actor, reportId: string, remarks?: string) {
  if (actor.role !== "NS_SPARK") throw new WorkflowError("Only NS Spark forwards reports");
  const r = await prisma.dailyReport.findUniqueOrThrow({ where: { id: reportId }, include: { project: true } });
  if (r.status === "FORWARDED") throw new WorkflowError("Already forwarded");
  await prisma.$transaction(async (tx) => {
    await tx.dailyReport.update({ where: { id: reportId }, data: { status: "FORWARDED", nsRemarks: remarks } });
    const to = await tx.user.findMany({ where: { role: { in: ["PRINCIPAL", "SECRETARY"] }, institutionId: r.project.institutionId }, select: { id: true } });
    await notify(tx, to.map((u) => u.id), r.projectId, `${r.project.code}: ${r.period.toLowerCase()} report forwarded by NS Spark`, actor.id);
    await audit(tx, { actor, action: "forward_report", projectId: r.projectId, remarks });
  });
}
