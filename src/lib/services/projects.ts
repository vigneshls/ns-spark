import { prisma } from "@/lib/db";
import { audit, nextProjectCode, notify, transition, type Actor } from "./workflow";
import { WorkflowError, STATUS } from "@/lib/workflow/machine";

export interface ClientInput {
  name: string; orgType: string; contactName: string; designation: string; mobile: string;
  email: string; address: string; city: string; state: string; country: string; website?: string;
}
export interface ProjectInput {
  institutionId: string; title: string; category: string; description: string; requirements: string;
  problem: string; deliverables: string; preferredTech?: string; expectedBudget?: number;
  expectedDays?: number; expectedEnd?: Date; expectations?: string; remarks?: string;
}

/** NS Spark registers a project (status DRAFT, client unverified). */
export async function registerProject(actor: Actor, client: ClientInput, input: ProjectInput) {
  if (actor.role !== "NS_SPARK") throw new WorkflowError("Only NS Spark can register projects");
  return prisma.$transaction(async (tx) => {
    const inst = await tx.institution.findUnique({ where: { id: input.institutionId } });
    if (!inst) throw new WorkflowError("Unknown institution");
    const c = await tx.client.create({ data: client });
    const code = await nextProjectCode(tx);
    const p = await tx.project.create({ data: { ...input, code, clientId: c.id, createdById: actor.id, status: STATUS.DRAFT } });
    await tx.workflowHistory.create({ data: { projectId: p.id, fromStatus: "-", toStatus: STATUS.DRAFT, action: "create", userId: actor.id, role: actor.role } });
    await audit(tx, { actor, action: "create_project", projectId: p.id, next: STATUS.DRAFT });
    return p;
  });
}

/** Verify + freeze client details. Further edits require an amendment (audited). */
export async function verifyClient(actor: Actor, projectId: string) {
  if (actor.role !== "NS_SPARK") throw new WorkflowError("Only NS Spark can verify client details");
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    await tx.client.update({ where: { id: p.clientId }, data: { verified: true, verifiedAt: new Date(), verifiedBy: actor.id } });
    await audit(tx, { actor, action: "verify_client", projectId });
  });
}

export async function amendClient(actor: Actor, projectId: string, patch: Partial<ClientInput>, reason: string) {
  if (actor.role !== "NS_SPARK") throw new WorkflowError("Only NS Spark can amend client details");
  if (!reason.trim()) throw new WorkflowError("Amendment reason is mandatory");
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId }, include: { client: true } });
    await tx.client.update({ where: { id: p.clientId }, data: patch });
    await audit(tx, { actor, action: "amend_client", projectId, remarks: reason, changes: { before: p.client, patch } });
  });
}

/** NS Spark picks the department (must belong to the project's institution). */
export async function assignDepartment(actor: Actor, projectId: string, departmentId: string, remarks?: string) {
  if (actor.role !== "NS_SPARK") throw new WorkflowError("Only NS Spark can select the department");
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const d = await tx.department.findFirst({ where: { id: departmentId, institutionId: p.institutionId, deletedAt: null } });
    if (!d) throw new WorkflowError("Department does not belong to the project's institution");
    if (!([STATUS.DRAFT, STATUS.REGISTERED, STATUS.INITIAL_REVIEW] as string[]).includes(p.status))
      throw new WorkflowError("Department can no longer be changed at this stage");
    await tx.project.update({ where: { id: projectId }, data: { departmentId, remarks: remarks ?? p.remarks } });
    await audit(tx, { actor, action: "assign_department", projectId, remarks, changes: { departmentId } });
  });
}

export async function assignCoordinator(actor: Actor, projectId: string, facultyId: string) {
  if (actor.role !== "HOD") throw new WorkflowError("Only the HOD can assign a coordinator");
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    if (p.departmentId !== actor.departmentId) throw new WorkflowError("Not your department's project");
    const f = await tx.user.findFirst({ where: { id: facultyId, role: "FACULTY", departmentId: actor.departmentId } });
    if (!f) throw new WorkflowError("Faculty must belong to your department");
    await tx.project.update({ where: { id: projectId }, data: { coordinatorId: facultyId } });
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: facultyId } },
      create: { projectId, userId: facultyId, kind: "COORDINATOR", role: "Project Coordinator" },
      update: { kind: "COORDINATOR", active: true },
    });
    await audit(tx, { actor, action: "assign_coordinator", projectId, changes: { facultyId } });
    await notify(tx, [facultyId], projectId, `${p.code}: you were assigned as project coordinator`, actor.id);
  });
}

export async function saveProposal(actor: Actor, projectId: string, content: unknown, totalCost?: number, quotation?: number) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (p.status !== STATUS.PROPOSAL_DRAFT) throw new WorkflowError("Proposal is not editable in the current status");
  if (!(actor.role === "HOD" && actor.departmentId === p.departmentId) && !(actor.role === "FACULTY" && p.coordinatorId === actor.id))
    throw new WorkflowError("Not authorized to edit this proposal");
  const draft = await prisma.proposal.findFirstOrThrow({ where: { projectId, state: "DRAFT" }, orderBy: { version: "desc" } });
  await prisma.proposal.update({ where: { id: draft.id }, data: { content: JSON.stringify(content), totalCost, quotation } });
}

export async function allocateMember(actor: Actor, projectId: string, userId: string, kind: "FACULTY" | "STUDENT", role?: string, responsibility?: string, maxProjects = 5) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const okStage = [STATUS.FORWARDED_FOR_EXECUTION, STATUS.ALLOCATION, STATUS.READY_TO_START, STATUS.ONGOING].includes(p.status as never);
  if (!okStage) throw new WorkflowError("Allocation opens only after final approval and forwarding for execution");
  const isHod = actor.role === "HOD" && actor.departmentId === p.departmentId;
  const isCoord = actor.role === "FACULTY" && p.coordinatorId === actor.id;
  if (!isHod && !isCoord) throw new WorkflowError("Not authorized to allocate team members");
  const u = await prisma.user.findFirst({ where: { id: userId, institutionId: p.institutionId, active: true, deletedAt: null } });
  if (!u || u.role !== kind) throw new WorkflowError(`User is not an eligible ${kind.toLowerCase()} of this institution`);
  const load = await prisma.projectMember.count({ where: { userId, active: true, project: { status: { in: [STATUS.ALLOCATION, STATUS.READY_TO_START, STATUS.ONGOING] } } } });
  if (load >= maxProjects) throw new WorkflowError(`Workload limit (${maxProjects} active projects) reached`);
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, kind, role, responsibility },
      update: { active: true, role, responsibility },
    });
    await audit(tx, { actor, action: "allocate_member", projectId, changes: { userId, kind } });
    await notify(tx, [userId], projectId, `${p.code}: you were allocated to the project`, actor.id);
  });
}

export { transition };
