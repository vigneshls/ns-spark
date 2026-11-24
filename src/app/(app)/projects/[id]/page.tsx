import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, projectScope } from "@/lib/auth";
import { availableActions, STATUS as S } from "@/lib/workflow/machine";
import { Badge, Card, btnCls, btnDanger, btnGhost, inputCls, label } from "@/components/ui";
import * as A from "../actions";

const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");
const row = (k: string, v?: React.ReactNode) => (
  <div className="grid grid-cols-3 gap-2 py-1 text-sm border-b border-slate-100"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 whitespace-pre-wrap">{v ?? "—"}</dd></div>
);
const destructive = /reject|cancel/;

const PROPOSAL_FIELDS: [string, [string, string][]][] = [
  ["A. Project Analysis", [["understanding", "Understanding of Client Requirements"], ["feasibility", "Technical Feasibility"], ["solution", "Proposed Solution"], ["scope", "Project Scope"], ["objectives", "Objectives"], ["deliverables", "Expected Deliverables"], ["challenges", "Challenges and Constraints"]]],
  ["B. Resources", [["facultyCount", "Faculty Required"], ["studentCount", "Students Required"], ["facultyExpertise", "Faculty Expertise"], ["studentSkills", "Student Skills"], ["teamStructure", "Proposed Team Structure"]]],
  ["C. Technical", [["stack", "Technology Stack"], ["languages", "Languages"], ["frameworks", "Frameworks"], ["databases", "Databases"], ["hardware", "Hardware"], ["software", "Software"], ["tools", "Tools & Platforms"], ["infra", "Infrastructure"]]],
  ["D. Planning", [["startDate", "Proposed Start (YYYY-MM-DD)"], ["duration", "Estimated Duration"], ["endDate", "Proposed Completion (YYYY-MM-DD)"], ["workingDays", "Working Days"], ["milestones", "Milestones"], ["tasks", "Task Distribution"]]],
  ["E. Financial (amounts)", [["costFaculty", "Faculty Cost"], ["costStudent", "Student Cost"], ["costHardware", "Hardware Cost"], ["costSoftware", "Software / Licensing"], ["costInfra", "Infrastructure"], ["costOther", "Other Expenses"]]],
  ["F. Additional", [["risks", "Project Risks"], ["mitigation", "Risk Mitigation"], ["deptRemarks", "Department Remarks"]]],
];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const { ok, err } = await searchParams;
  const p = await prisma.project.findFirst({
    where: { id, deletedAt: null, ...projectScope(u) },
    include: {
      client: true, institution: true, department: true, documents: true, milestones: { orderBy: { dueDate: "asc" } },
      members: { include: { user: true }, where: { active: true } }, proposals: { orderBy: { version: "desc" } },
      approvals: { orderBy: { createdAt: "asc" } }, history: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!p) notFound();

  const isHod = u.role === "HOD" && u.departmentId === p.departmentId;
  const isCoord = u.role === "FACULTY" && p.coordinatorId === u.id;
  const inScope = (r: string) =>
    (r === "PRINCIPAL" || r === "SECRETARY") ? u.institutionId === p.institutionId : r === "HOD" ? isHod : r === "FACULTY" ? isCoord : true;
  const actions = availableActions(p.status, u.role).filter(() => inScope(u.role));
  const pre = ([S.DRAFT, S.REGISTERED, S.INITIAL_REVIEW] as string[]).includes(p.status);
  const allocStage = ([S.FORWARDED_FOR_EXECUTION, S.ALLOCATION, S.READY_TO_START, S.ONGOING] as string[]).includes(p.status);
  const canTeam = isHod || isCoord;
  const canMilestone = (isHod || isCoord) && ([S.READY_TO_START, S.ONGOING, S.ALLOCATION] as string[]).includes(p.status);

  const [depts, faculty, students] = await Promise.all([
    u.role === "NS_SPARK" && pre ? prisma.department.findMany({ where: { institutionId: p.institutionId, deletedAt: null } }) : [],
    (isHod && p.departmentId) || canTeam ? prisma.user.findMany({ where: { role: "FACULTY", institutionId: p.institutionId, active: true, deletedAt: null } }) : [],
    canTeam && allocStage ? prisma.user.findMany({ where: { role: "STUDENT", institutionId: p.institutionId, active: true, deletedAt: null } }) : [],
  ]);
  const draft = p.proposals.find((x) => x.state === "DRAFT");
  const editableProposal = p.status === S.PROPOSAL_DRAFT && (isHod || isCoord) && draft;
  const draftContent = draft ? (JSON.parse(draft.content || "{}") as Record<string, string>) : {};
  const showProposals = p.proposals.some((x) => x.state !== "DRAFT") || editableProposal;
  const c = p.client;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{p.title}</h1><Badge s={p.status} />
        <span className="font-mono text-sm text-slate-500">{p.code}</span>
      </div>
      {ok && <p className="text-sm text-emerald-700 bg-emerald-50 rounded p-2">{ok}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 rounded p-2">{err}</p>}

      {(actions.length > 0 || (u.role === "NS_SPARK" && (pre || !c.verified)) || (isHod && ([S.FORWARDED_TO_DEPT, S.DEPT_ANALYSIS, S.PROPOSAL_DRAFT, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION] as string[]).includes(p.status))) && (
        <Card title="Actions">
          <div className="space-y-3">
            {u.role === "NS_SPARK" && !c.verified && (
              <form action={A.verifyClientAction} className="flex items-center gap-2"><input type="hidden" name="id" value={p.id} />
                <span className="text-sm">Client details are not yet verified.</span><button className={btnCls}>Verify &amp; freeze client details</button></form>)}
            {u.role === "NS_SPARK" && pre && (
              <form action={A.assignDeptAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={p.id} />
                <select name="departmentId" required defaultValue={p.departmentId ?? ""} className={inputCls + " max-w-xs"}><option value="">Select department…</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                <input name="remarks" placeholder="Internal remarks" className={inputCls + " max-w-sm"} /><button className={btnGhost}>Save department</button></form>)}
            {isHod && ([S.FORWARDED_TO_DEPT, S.DEPT_ANALYSIS, S.PROPOSAL_DRAFT, S.FORWARDED_FOR_EXECUTION, S.ALLOCATION] as string[]).includes(p.status) && (
              <form action={A.assignCoordAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={p.id} />
                <select name="facultyId" required defaultValue={p.coordinatorId ?? ""} className={inputCls + " max-w-xs"}><option value="">Faculty coordinator…</option>{faculty.filter((f) => f.departmentId === u.departmentId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                <button className={btnGhost}>Assign coordinator</button></form>)}
            {actions.map((a) => (
              <form key={a.action} action={A.doTransition} className="flex flex-wrap items-start gap-2">
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value={a.action} />
                {a.action === "commence" && <input type="date" name="commencedAt" required className={inputCls + " max-w-[10rem]"} title="Actual commencement date" />}
                {(a.remarksRequired || a.stage) && <input name="remarks" required={a.remarksRequired} placeholder={a.remarksRequired ? "Remarks (mandatory)" : "Remarks (optional)"} className={inputCls + " max-w-sm"} />}
                <button className={destructive.test(a.action) ? btnDanger : btnCls}>{label(a.action)}</button>
              </form>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Project details"><dl>
          {row("Institution", p.institution.name)}{row("Department", p.department?.name)}{row("Category", p.category)}{row("Description", p.description)}
          {row("Requirements", p.requirements)}{row("Problem Statement", p.problem)}{row("Deliverables", p.deliverables)}{row("Preferred Technology", p.preferredTech)}
          {row("Expected Budget", p.expectedBudget?.toLocaleString())}{row("Expected Duration (days)", p.expectedDays)}{row("Expected Completion", p.expectedEnd?.toISOString().slice(0, 10))}
          {row("Client Expectations", p.expectations)}{row("Remarks", p.remarks)}{row("Commenced", fmt(p.commencedAt))}
        </dl></Card>
        <Card title="Client" right={<span className={`text-xs ${c.verified ? "text-emerald-700" : "text-amber-700"}`}>{c.verified ? "Verified · frozen" : "Unverified"}</span>}><dl>
          {row("Organization", c.name)}{row("Type", c.orgType)}{row("Contact", `${c.contactName} (${c.designation})`)}{row("Mobile", c.mobile)}{row("Email", c.email)}
          {row("Address", `${c.address}, ${c.city}, ${c.state}, ${c.country}`)}{row("Website", c.website)}
        </dl></Card>
      </div>

      <Card title="Supporting documents">
        <ul className="text-sm space-y-1 mb-3">
          {p.documents.map((d) => <li key={d.id}><a className="text-indigo-600" href={`/api/documents/${d.id}`}>{d.fileName}</a> <span className="text-slate-400">({Math.ceil(d.size / 1024)} KB)</span></li>)}
          {!p.documents.length && <li className="text-slate-400">No documents.</li>}
        </ul>
        {["NS_SPARK", "HOD", "FACULTY"].includes(u.role) && (
          <form action={`/api/projects/${p.id}/documents`} method="post" encType="multipart/form-data" className="flex gap-2 items-center">
            <input type="file" name="file" required accept=".pdf,.xlsx,.xls,.docx,.png,.jpg,.jpeg" className="text-sm" /><button className={btnGhost}>Upload (PDF, Excel, Word, image · max 10 MB)</button>
          </form>)}
      </Card>

      {showProposals && (
        <Card title="Department proposal">
          {editableProposal && (
            <form action={A.saveProposalAction} className="space-y-4 mb-4">
              <input type="hidden" name="id" value={p.id} />
              <p className="text-sm text-slate-500">Editing draft v{draft!.version}. Save, then use “Submit Proposal” above.</p>
              {PROPOSAL_FIELDS.map(([sec, fields]) => (
                <fieldset key={sec} className="border rounded-lg p-3"><legend className="px-1 text-sm font-medium">{sec}</legend>
                  <div className="grid md:grid-cols-2 gap-2">{fields.map(([k, l]) => (
                    <label key={k} className="block text-xs text-slate-600">{l}<textarea name={k} rows={2} defaultValue={draftContent[k] ?? ""} className={inputCls + " mt-1"} /></label>))}</div>
                </fieldset>))}
              <label className="block text-sm max-w-xs">Proposed client quotation<input name="quotation" type="number" defaultValue={draft!.quotation ?? ""} className={inputCls + " mt-1"} /></label>
              <button className={btnCls}>Save draft</button>
            </form>)}
          <div className="space-y-3">
            {p.proposals.filter((x) => x.state !== "DRAFT" || !editableProposal).map((x) => {
              const ct = JSON.parse(x.content || "{}") as Record<string, string>;
              return (
                <details key={x.id} className="border rounded-lg p-3" open={x.state === "SUBMITTED"}>
                  <summary className="cursor-pointer text-sm font-medium">Version {x.version} — {label(x.state)} · Total cost {x.totalCost?.toLocaleString() ?? "—"} · Quotation {x.quotation?.toLocaleString() ?? "—"}</summary>
                  <dl className="mt-2">{PROPOSAL_FIELDS.flatMap(([, f]) => f).filter(([k]) => ct[k]).map(([k, l]) => row(l, ct[k]))}</dl>
                  <p className="text-xs text-slate-400 mt-2">Submitted {fmt(x.submittedAt)}</p>
                </details>);
            })}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Team allocation">
          <table className="w-full text-sm mb-3"><thead><tr className="text-left text-slate-500"><th>Name</th><th>ID / Reg. No</th><th>Type</th><th>Role</th><th>Since</th></tr></thead><tbody>
            {p.members.map((m) => <tr key={m.id} className="border-t"><td className="py-1">{m.user.name}</td><td>{m.user.employeeId ?? m.user.registerNo}</td><td>{label(m.kind)}</td><td>{m.role ?? "—"}</td><td>{m.allocatedAt.toISOString().slice(0, 10)}</td></tr>)}
            {!p.members.length && <tr><td colSpan={5} className="text-slate-400 py-2">No one allocated.</td></tr>}</tbody></table>
          {canTeam && allocStage && (
            <form action={A.allocateAction} className="grid grid-cols-2 gap-2"><input type="hidden" name="id" value={p.id} />
              <select name="userId" required className={inputCls}><option value="">Select member…</option>
                <optgroup label="Faculty">{faculty.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.employeeId})</option>)}</optgroup>
                <optgroup label="Students">{students.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.registerNo})</option>)}</optgroup></select>
              <select name="kind" className={inputCls}><option value="STUDENT">Student</option><option value="FACULTY">Faculty</option></select>
              <input name="role" placeholder="Assigned role" className={inputCls} /><input name="responsibility" placeholder="Responsibilities" className={inputCls} />
              <button className={btnGhost + " col-span-2"}>Allocate</button></form>)}
        </Card>
        <Card title="Milestones">
          <ul className="text-sm space-y-1 mb-3">
            {p.milestones.map((m) => (
              <li key={m.id} className="flex justify-between items-center border-t pt-1"><span>{m.title} <span className="text-slate-400">due {m.dueDate.toISOString().slice(0, 10)}</span></span>
                {m.doneAt ? <span className="text-emerald-700 text-xs">Done</span> : canMilestone ? (
                  <form action={A.completeMilestoneAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="milestoneId" value={m.id} /><button className="text-xs text-indigo-600">Mark done</button></form>
                ) : <span className={`text-xs ${m.dueDate < new Date() ? "text-red-600" : "text-slate-500"}`}>{m.dueDate < new Date() ? "Overdue" : "Open"}</span>}</li>))}
            {!p.milestones.length && <li className="text-slate-400">No milestones.</li>}
          </ul>
          {canMilestone && (
            <form action={A.addMilestoneAction} className="flex gap-2"><input type="hidden" name="id" value={p.id} />
              <input name="title" required placeholder="Milestone" className={inputCls} /><input name="dueDate" type="date" required className={inputCls + " max-w-[10rem]"} /><button className={btnGhost}>Add</button></form>)}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Approval history"><ul className="text-sm space-y-2">
          {p.approvals.map((a) => <li key={a.id} className="border-t pt-1"><b>{label(a.level)}</b> · {label(a.stage)} · {label(a.decision)} <span className="text-slate-400">{fmt(a.createdAt)}</span>{a.remarks && <div className="text-slate-600">“{a.remarks}”</div>}</li>)}
          {!p.approvals.length && <li className="text-slate-400">No approval decisions yet.</li>}</ul></Card>
        <Card title="Workflow history"><ul className="text-xs space-y-1">
          {p.history.map((h) => <li key={h.id} className="border-t pt-1">{fmt(h.createdAt)} — {label(h.action)}: {label(h.fromStatus)} → <b>{label(h.toStatus)}</b> ({label(h.role)}){h.remarks && ` — ${h.remarks}`}</li>)}</ul></Card>
      </div>
    </div>
  );
}
