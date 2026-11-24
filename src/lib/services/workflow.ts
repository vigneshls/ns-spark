import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTransition, WorkflowError, STATUS, type Role } from "@/lib/workflow/machine";

export interface Actor { id: string; role: Role; institutionId?: string | null; departmentId?: string | null; name?: string }
type Tx = Prisma.TransactionClient;

/** Next project code: NSP-<year>-<4 digit seq>, unique across both institutions. */
export async function nextProjectCode(tx: Tx, year = new Date().getFullYear()) {
  const prefix = `NSP-${year}-`;
  const last = await tx.project.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" } });
  const n = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(4, "0");
}

export async function audit(tx: Tx, a: { actor?: Actor; action: string; projectId?: string; prev?: string; next?: string; remarks?: string | null; changes?: unknown }) {
  await tx.auditLog.create({
    data: {
      userId: a.actor?.id, role: a.actor?.role, action: a.action, projectId: a.projectId,
      prevStatus: a.prev, newStatus: a.next, remarks: a.remarks ?? undefined,
      changes: a.changes ? JSON.stringify(a.changes) : undefined,
    },
  });
}

export async function notify(tx: Tx, userIds: string[], projectId: string, message: string, exceptId?: string) {
  const ids = [...new Set(userIds)].filter((i) => i !== exceptId);
  if (ids.length) await tx.notification.createMany({ data: ids.map((userId) => ({ userId, projectId, message })) });
}

async function recipients(tx: Tx, to: string, p: { institutionId: string; departmentId: string | null; coordinatorId: string | null }) {
  const S = STATUS;
  const byRole = (role: string, scoped = true) =>
    tx.user.findMany({ where: { role, active: true, deletedAt: null, ...(scoped ? { institutionId: p.institutionId } : {}) }, select: { id: true } });
  const hod = p.departmentId ? await tx.user.findMany({ where: { role: "HOD", departmentId: p.departmentId, active: true }, select: { id: true } }) : [];
  const coord = p.coordinatorId ? [{ id: p.coordinatorId }] : [];
  let list: { id: string }[] = [];
  if ([S.PENDING_PRINCIPAL_INITIAL, S.PENDING_PRINCIPAL_FINAL].includes(to as never)) list = await byRole("PRINCIPAL");
  else if ([S.PENDING_SECRETARY_INITIAL, S.PENDING_SECRETARY_FINAL].includes(to as never)) list = await byRole("SECRETARY");
  else if ([S.FORWARDED_TO_DEPT, S.FORWARDED_FOR_EXECUTION, S.PROPOSAL_DRAFT, S.FINAL_APPROVED, S.IN_REGISTER].includes(to as never)) list = [...hod, ...coord];
  else list = await byRole("NS_SPARK", false);
  return list.map((u) => u.id);
}

/** Authorization scoping beyond role: institution / department / membership isolation. */
async function assertScope(tx: Tx, actor: Actor, p: { institutionId: string; departmentId: string | null; coordinatorId: string | null; id: string }) {
  if (["PRINCIPAL", "SECRETARY"].includes(actor.role) && actor.institutionId !== p.institutionId)
    throw new WorkflowError("Project belongs to another institution");
  if (actor.role === "HOD" && actor.departmentId !== p.departmentId)
    throw new WorkflowError("Project is not assigned to your department");
  if (actor.role === "FACULTY") {
    const m = await tx.projectMember.findFirst({ where: { projectId: p.id, userId: actor.id, active: true, kind: "COORDINATOR" } });
    if (p.coordinatorId !== actor.id && !m) throw new WorkflowError("Only the project coordinator may do this");
  }
}

export async function transition(projectId: string, action: string, actor: Actor, remarks?: string | null, extra: { commencedAt?: Date } = {}) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.findFirst({ where: { id: projectId, deletedAt: null }, include: { client: true } });
    if (!p) throw new WorkflowError("Project not found");
    const tr = resolveTransition(p.status, action, actor.role, remarks);
    await assertScope(tx, actor, p);

    // ---- business guards ----
    if (["register", "submit_initial"].includes(action) && !p.client.verified)
      throw new WorkflowError("Client details must be verified first");
    if (action === "submit_initial" && !p.departmentId)
      throw new WorkflowError("A department must be selected before initial approval submission");
    if (action === "start_proposal" && !p.coordinatorId && actor.role === "HOD")
      throw new WorkflowError("Assign a faculty coordinator before starting the proposal");
    if (action === "confirm_team") {
      const students = await tx.projectMember.count({ where: { projectId, kind: "STUDENT", active: true } });
      if (!p.coordinatorId || students < 1) throw new WorkflowError("Allocate a coordinator and at least one student first");
    }
    const data: Prisma.ProjectUpdateInput = { status: tr.to };
    if (action === "commence") data.commencedAt = extra.commencedAt ?? new Date();
    if (action === "complete") data.completedAt = new Date();

    // ---- proposal versioning ----
    if (action === "start_proposal") {
      await tx.proposal.create({ data: { projectId, version: 1, content: "{}" } });
    } else if (action === "submit_proposal") {
      const draft = await tx.proposal.findFirst({ where: { projectId, state: "DRAFT" }, orderBy: { version: "desc" } });
      if (!draft) throw new WorkflowError("No proposal draft to submit");
      await tx.proposal.update({ where: { id: draft.id }, data: { state: "SUBMITTED", submittedBy: actor.id, submittedAt: new Date() } });
    } else if (tr.to === STATUS.PROPOSAL_DRAFT && p.status !== STATUS.DEPT_ANALYSIS) {
      const latest = await tx.proposal.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
      if (latest) {
        await tx.proposal.update({ where: { id: latest.id }, data: { state: "SUPERSEDED" } });
        await tx.proposal.create({ data: { projectId, version: latest.version + 1, content: latest.content, totalCost: latest.totalCost, quotation: latest.quotation } });
      }
    } else if (action === "secretary_approve_final") {
      const latest = await tx.proposal.findFirst({ where: { projectId, state: "SUBMITTED" }, orderBy: { version: "desc" } });
      if (latest) await tx.proposal.update({ where: { id: latest.id }, data: { state: "APPROVED" } });
    }

    const updated = await tx.project.update({ where: { id: projectId }, data });
    if (tr.stage && tr.level && tr.decision)
      await tx.approval.create({ data: { projectId, stage: tr.stage, level: tr.level, decision: tr.decision, remarks, userId: actor.id } });
    await tx.workflowHistory.create({ data: { projectId, fromStatus: p.status, toStatus: tr.to, action, userId: actor.id, role: actor.role, remarks } });
    await audit(tx, { actor, action, projectId, prev: p.status, next: tr.to, remarks });
    const to = await recipients(tx, tr.to, updated);
    await notify(tx, to, projectId, `${p.code} – ${p.title}: ${action.replace(/_/g, " ")} → ${tr.to.replace(/_/g, " ")}`, actor.id);
    return updated;
  });
}
