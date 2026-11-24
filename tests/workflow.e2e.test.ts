import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { registerProject, verifyClient, assignDepartment, assignCoordinator, saveProposal, allocateMember } from "@/lib/services/projects";
import { transition, type Actor } from "@/lib/services/workflow";
import { saveTimesheet, reviewStudentTimesheet, hodReviewTimesheet, consolidateDailyReport, forwardReport } from "@/lib/services/timesheets";

const actor = async (email: string): Promise<Actor> => {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: u.id, role: u.role as Actor["role"], institutionId: u.institutionId, departmentId: u.departmentId, name: u.name };
};
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, re);

test("full NS Spark lifecycle with guards", async () => {
  const [spark, pri, sec, hod, fac, s1, s2] = await Promise.all(
    ["spark", "principal", "secretary", "hod", "faculty", "student1", "student2"].map((n) => actor(`${n}@nsspark.local`)));
  const inst = await prisma.institution.findUniqueOrThrow({ where: { code: "NSEC" } });
  const dept = await prisma.department.findFirstOrThrow({ where: { institutionId: inst.id, name: { startsWith: "Computer" } } });

  const p = await registerProject(spark,
    { name: "Acme Ltd", orgType: "Industry", contactName: "A. Person", designation: "CTO", mobile: "9999999999", email: "a@acme.test", address: "1 Road", city: "Chennai", state: "TN", country: "India" },
    { institutionId: inst.id, title: "Inventory Portal", category: "Web", description: "d", requirements: "r", problem: "p", deliverables: "x" });
  assert.match(p.code, /^NSP-\d{4}-\d{4}$/);

  // guards before verification / department
  await rejects(transition(p.id, "register", spark), /verified/);
  await verifyClient(spark, p.id);
  await transition(p.id, "register", spark);
  await transition(p.id, "start_review", spark);
  await rejects(transition(p.id, "submit_initial", spark), /department/);
  await assignDepartment(spark, p.id, dept.id, "best fit");
  await transition(p.id, "submit_initial", spark);

  // hierarchy: secretary cannot jump ahead, principal remarks mandatory on reject
  await rejects(transition(p.id, "secretary_approve_initial", sec), /not allowed from status/);
  await rejects(transition(p.id, "principal_reject_initial", pri), /Remarks/);
  await rejects(transition(p.id, "principal_approve_initial", sec), /may not perform/);
  await transition(p.id, "principal_approve_initial", pri);
  await transition(p.id, "secretary_approve_initial", sec);
  await transition(p.id, "forward_to_department", spark);
  await transition(p.id, "begin_analysis", hod);
  await rejects(transition(p.id, "start_proposal", hod), /coordinator/);
  await assignCoordinator(hod, p.id, fac.id);
  await transition(p.id, "start_proposal", hod);
  await saveProposal(hod, p.id, { solution: "v1" }, 100000, 120000);
  await transition(p.id, "submit_proposal", fac);
  await transition(p.id, "begin_proposal_review", spark);
  await transition(p.id, "forward_proposal", spark);
  await transition(p.id, "principal_revise_final", pri, "Reduce cost");   // revision loop
  assert.equal((await prisma.proposal.count({ where: { projectId: p.id } })), 2, "v1 preserved, v2 created");
  await saveProposal(fac, p.id, { solution: "v2" }, 90000, 110000);
  await transition(p.id, "submit_proposal", fac);
  await transition(p.id, "begin_proposal_review", spark);
  await transition(p.id, "forward_proposal", spark);
  await transition(p.id, "principal_approve_final", pri);
  await transition(p.id, "secretary_approve_final", sec);
  await transition(p.id, "add_to_register", spark);
  await transition(p.id, "forward_for_execution", spark);
  await transition(p.id, "begin_allocation", hod);
  await allocateMember(hod, p.id, s1.id, "STUDENT", "Developer");
  await allocateMember(fac, p.id, s2.id, "STUDENT", "Tester");
  await transition(p.id, "confirm_team", hod);

  // timesheets blocked before commencement
  await rejects(saveTimesheet(s1, p.id, new Date(), { work: "x", hours: 2 }, true), /ongoing/);
  await transition(p.id, "commence", hod, null, { commencedAt: new Date(Date.now() - 3 * 86400000) });
  await rejects(saveTimesheet(s1, p.id, new Date(Date.now() - 10 * 86400000), { work: "x", hours: 2 }, true), /before/);

  const today = new Date();
  const ts = await saveTimesheet(s1, p.id, today, { work: "Built login", hours: 6 }, true);
  await rejects(saveTimesheet(s1, p.id, today, { work: "dup", hours: 1 }, true), /already submitted/);
  await rejects(reviewStudentTimesheet(hod, ts.id, "APPROVED"), /coordinator/);
  await reviewStudentTimesheet(fac, ts.id, "CORRECTION", "Add detail");
  await saveTimesheet(s1, p.id, today, { work: "Built login + tests", hours: 6 }, true); // resubmit
  await reviewStudentTimesheet(fac, ts.id, "APPROVED");
  await hodReviewTimesheet(hod, ts.id, "APPROVED");
  const report = await consolidateDailyReport(hod, p.id, today);
  await forwardReport(spark, report.id, "ok");

  // audit / history integrity
  const hist = await prisma.workflowHistory.findMany({ where: { projectId: p.id } });
  assert.equal(hist.length, 23, "every transition (incl. create) recorded in workflow_history");
  assert.ok(await prisma.notification.count({ where: { userId: pri.id, projectId: p.id } }) >= 2);
  const approvals = await prisma.approval.findMany({ where: { projectId: p.id, stage: "FINAL", decision: "APPROVED" } });
  assert.deepEqual(approvals.map((a) => a.level).sort(), ["PRINCIPAL", "SECRETARY"]);
  await transition(p.id, "complete", hod, "Delivered");
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).status, "COMPLETED");
});
