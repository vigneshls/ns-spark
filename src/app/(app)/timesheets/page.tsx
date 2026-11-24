import { prisma } from "@/lib/db";
import { requireUser, projectScope } from "@/lib/auth";
import { STATUS as S } from "@/lib/workflow/machine";
import { Badge, Card, btnCls, btnDanger, btnGhost, inputCls } from "@/components/ui";
import * as A from "../projects/actions";

const dstr = (d: Date) => d.toISOString().slice(0, 10);

function ReviewForm({ id, action }: { id: string; action: (f: FormData) => Promise<void> }) {
  return (
    <form action={action} className="flex flex-wrap gap-1 items-center mt-1"><input type="hidden" name="id" value={id} />
      <input name="remarks" placeholder="Remarks (required to reject / correct)" className={inputCls + " max-w-xs"} />
      <button name="decision" value="APPROVED" className={btnCls}>Approve</button>
      <button name="decision" value="CORRECTION" className={btnGhost}>Request correction</button>
      <button name="decision" value="REJECTED" className={btnDanger}>Reject</button></form>
  );
}

export default async function Timesheets({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireUser();
  const { ok, err } = await searchParams;
  const scope = { deletedAt: null, ...projectScope(u) };
  const msg = <>{ok && <p className="text-sm text-emerald-700 bg-emerald-50 rounded p-2">{ok}</p>}{err && <p className="text-sm text-red-700 bg-red-50 rounded p-2">{err}</p>}</>;

  // ---------- students & faculty: own entries ----------
  const mine = u.role === "STUDENT" || u.role === "FACULTY";
  const projects = mine ? await prisma.project.findMany({ where: { ...scope, status: S.ONGOING }, select: { id: true, code: true, title: true, commencedAt: true } }) : [];
  const own = mine ? await prisma.timesheet.findMany({ where: { userId: u.id }, include: { project: true, reviews: { orderBy: { createdAt: "desc" } } }, orderBy: { date: "desc" }, take: 50 }) : [];

  // ---------- faculty coordinator: student sheets to verify ----------
  const toVerify = u.role === "FACULTY" ? await prisma.timesheet.findMany({ where: { kind: "STUDENT", status: "SUBMITTED", project: { coordinatorId: u.id } }, include: { user: true, project: true }, orderBy: { date: "asc" } }) : [];

  // ---------- HOD ----------
  const hodQueue = u.role === "HOD" ? await prisma.timesheet.findMany({
    where: { project: scope, OR: [{ kind: "STUDENT", status: "FACULTY_APPROVED" }, { kind: "FACULTY", status: "SUBMITTED" }] }, include: { user: true, project: true }, orderBy: { date: "asc" } }) : [];
  const hodProjects = u.role === "HOD" ? await prisma.project.findMany({ where: { ...scope, status: S.ONGOING }, select: { id: true, code: true, title: true } }) : [];

  // ---------- reports ----------
  const reports = ["NS_SPARK", "HOD", "PRINCIPAL", "SECRETARY", "ADMIN"].includes(u.role)
    ? await prisma.dailyReport.findMany({
      where: { project: scope, ...(u.role === "PRINCIPAL" || u.role === "SECRETARY" ? { status: "FORWARDED" } : {}) }, include: { project: true }, orderBy: { createdAt: "desc" }, take: 50 }) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{u.role === "STUDENT" || u.role === "FACULTY" ? "Timesheets" : "Timesheets & Progress Reports"}</h1>
      {msg}

      {mine && (
        <Card title={u.role === "STUDENT" ? "New daily timesheet" : "My project update"}>
          {!projects.length ? <p className="text-sm text-slate-500">No ongoing projects. Timesheets open from each project’s commencement date.</p> : (
            <form action={A.saveTimesheetAction} className="grid md:grid-cols-2 gap-2">
              <select name="projectId" required className={inputCls}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}</select>
              <input type="date" name="date" required defaultValue={dstr(new Date())} max={dstr(new Date())} className={inputCls} />
              <textarea name="work" required rows={3} placeholder="Work description *" className={inputCls + " md:col-span-2"} />
              <textarea name="tasksDone" rows={2} placeholder="Tasks completed" className={inputCls} />
              <textarea name="issues" rows={2} placeholder="Challenges / issues" className={inputCls} />
              <textarea name="nextPlan" rows={2} placeholder="Next activities" className={inputCls} />
              <input name="evidence" placeholder="Evidence / link / reference" className={inputCls} />
              <input name="hours" type="number" step="0.5" min="0.5" max="24" required placeholder="Hours worked *" className={inputCls} />
              <input name="progress" type="number" min="0" max="100" placeholder="Progress %" className={inputCls} />
              <div className="flex gap-2 md:col-span-2"><button name="intent" value="draft" className={btnGhost}>Save draft</button><button name="intent" value="submit" className={btnCls}>Submit</button></div>
            </form>)}
        </Card>
      )}

      {mine && (
        <Card title="My entries">
          <table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Date</th><th>Project</th><th>Work</th><th>Hrs</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
            {own.map((t) => <tr key={t.id} className="border-t align-top"><td className="py-1">{dstr(t.date)}</td><td>{t.project.code}</td><td>{t.work}</td><td>{t.hours}</td><td><Badge s={t.status} /></td><td className="text-xs text-slate-600">{t.reviews[0]?.remarks ?? ""}</td></tr>)}
            {!own.length && <tr><td colSpan={6} className="py-3 text-slate-400">No entries yet.</td></tr>}</tbody></table>
          <p className="text-xs text-slate-400 mt-2">To fix a rejected or returned entry, submit the same date again from the form above.</p>
        </Card>
      )}

      {u.role === "FACULTY" && (
        <Card title={`Student timesheets awaiting verification (${toVerify.length})`}>
          {toVerify.map((t) => (<div key={t.id} className="border-t py-2 text-sm"><b>{t.user.name}</b> · {t.project.code} · {dstr(t.date)} · {t.hours}h<div>{t.work}</div>{t.tasksDone && <div className="text-slate-500">Done: {t.tasksDone}</div>}{t.issues && <div className="text-slate-500">Issues: {t.issues}</div>}<ReviewForm id={t.id} action={A.facultyReviewAction} /></div>))}
          {!toVerify.length && <p className="text-sm text-slate-400">Nothing pending.</p>}
        </Card>)}

      {u.role === "HOD" && (<>
        <Card title={`Awaiting HOD review (${hodQueue.length})`}>
          {hodQueue.map((t) => (<div key={t.id} className="border-t py-2 text-sm"><b>{t.user.name}</b> ({t.kind.toLowerCase()}) · {t.project.code} · {dstr(t.date)} · {t.hours}h<div>{t.work}</div><ReviewForm id={t.id} action={A.hodReviewAction} /></div>))}
          {!hodQueue.length && <p className="text-sm text-slate-400">Nothing pending.</p>}
        </Card>
        <Card title="Consolidate approved timesheets for NS Spark">
          <form action={A.consolidateAction} className="flex flex-wrap gap-2">
            <select name="projectId" required className={inputCls + " max-w-sm"}>{hodProjects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}</select>
            <input type="date" name="date" required defaultValue={dstr(new Date())} className={inputCls + " max-w-[10rem]"} />
            <select name="period" className={inputCls + " max-w-[10rem]"}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly (7 days)</option></select>
            <button className={btnCls}>Send to NS Spark</button></form>
        </Card></>)}

      {reports.length > 0 || ["NS_SPARK", "PRINCIPAL", "SECRETARY", "HOD"].includes(u.role) ? (
        <Card title="Progress reports">
          {reports.map((r) => (
            <div key={r.id} className="border-t py-2 text-sm"><b>{r.project.code}</b> · {r.period.toLowerCase()} · {dstr(r.forDate)} · <Badge s={r.status} /><div className="text-slate-600">{r.summary}</div>{r.nsRemarks && <div className="text-xs text-slate-500">NS Spark: {r.nsRemarks}</div>}
              {u.role === "NS_SPARK" && r.status !== "FORWARDED" && (
                <form action={A.forwardReportAction} className="flex gap-2 mt-1"><input type="hidden" name="id" value={r.id} /><input name="remarks" placeholder="Monitoring remarks" className={inputCls + " max-w-sm"} /><button className={btnCls}>Forward to Principal &amp; Secretary</button></form>)}
            </div>))}
          {!reports.length && <p className="text-sm text-slate-400">No reports.</p>}
        </Card>) : null}
    </div>
  );
}
