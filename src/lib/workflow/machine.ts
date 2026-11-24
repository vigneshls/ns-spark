// Pure workflow state machine: no I/O. The ONLY place where legal status changes are defined.
export type Role = "ADMIN" | "NS_SPARK" | "PRINCIPAL" | "SECRETARY" | "HOD" | "FACULTY" | "STUDENT";

export const STATUS = {
  DRAFT: "DRAFT",
  REGISTERED: "REGISTERED",
  INITIAL_REVIEW: "UNDER_NS_SPARK_INITIAL_REVIEW",
  PENDING_PRINCIPAL_INITIAL: "PENDING_PRINCIPAL_INITIAL_APPROVAL",
  PENDING_SECRETARY_INITIAL: "PENDING_SECRETARY_INITIAL_APPROVAL",
  INITIAL_APPROVED: "INITIAL_APPROVAL_COMPLETED",
  FORWARDED_TO_DEPT: "FORWARDED_TO_DEPARTMENT",
  DEPT_ANALYSIS: "DEPARTMENT_ANALYSIS",
  PROPOSAL_DRAFT: "PROPOSAL_DRAFT",
  PROPOSAL_SUBMITTED: "PROPOSAL_SUBMITTED",
  PROPOSAL_REVIEW: "UNDER_NS_SPARK_PROPOSAL_REVIEW",
  PENDING_PRINCIPAL_FINAL: "PENDING_PRINCIPAL_FINAL_APPROVAL",
  PENDING_SECRETARY_FINAL: "PENDING_SECRETARY_FINAL_APPROVAL",
  FINAL_APPROVED: "FINAL_APPROVAL_COMPLETED",
  IN_REGISTER: "ADDED_TO_APPROVED_REGISTER",
  FORWARDED_FOR_EXECUTION: "FORWARDED_FOR_EXECUTION",
  ALLOCATION: "FACULTY_STUDENT_ALLOCATION",
  READY_TO_START: "READY_TO_START",
  ONGOING: "ONGOING",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export interface Transition {
  action: string;
  from: Status;
  to: Status;
  roles: Role[];
  remarksRequired?: boolean;
  stage?: "INITIAL" | "FINAL";
  level?: "PRINCIPAL" | "SECRETARY" | "NS_SPARK";
  decision?: string;
}

const S = STATUS;
const t = (x: Transition) => x;

export const TRANSITIONS: Transition[] = [
  t({ action: "register", from: S.DRAFT, to: S.REGISTERED, roles: ["NS_SPARK"] }),
  t({ action: "start_review", from: S.REGISTERED, to: S.INITIAL_REVIEW, roles: ["NS_SPARK"] }),
  t({ action: "submit_initial", from: S.INITIAL_REVIEW, to: S.PENDING_PRINCIPAL_INITIAL, roles: ["NS_SPARK"], stage: "INITIAL", level: "NS_SPARK", decision: "FORWARDED" }),

  t({ action: "principal_approve_initial", from: S.PENDING_PRINCIPAL_INITIAL, to: S.PENDING_SECRETARY_INITIAL, roles: ["PRINCIPAL"], stage: "INITIAL", level: "PRINCIPAL", decision: "APPROVED" }),
  t({ action: "principal_reject_initial", from: S.PENDING_PRINCIPAL_INITIAL, to: S.REJECTED, roles: ["PRINCIPAL"], remarksRequired: true, stage: "INITIAL", level: "PRINCIPAL", decision: "REJECTED" }),
  t({ action: "principal_clarify_initial", from: S.PENDING_PRINCIPAL_INITIAL, to: S.INITIAL_REVIEW, roles: ["PRINCIPAL"], remarksRequired: true, stage: "INITIAL", level: "PRINCIPAL", decision: "CLARIFICATION" }),

  t({ action: "secretary_approve_initial", from: S.PENDING_SECRETARY_INITIAL, to: S.INITIAL_APPROVED, roles: ["SECRETARY"], stage: "INITIAL", level: "SECRETARY", decision: "APPROVED" }),
  t({ action: "secretary_reject_initial", from: S.PENDING_SECRETARY_INITIAL, to: S.REJECTED, roles: ["SECRETARY"], remarksRequired: true, stage: "INITIAL", level: "SECRETARY", decision: "REJECTED" }),
  t({ action: "secretary_clarify_initial", from: S.PENDING_SECRETARY_INITIAL, to: S.INITIAL_REVIEW, roles: ["SECRETARY"], remarksRequired: true, stage: "INITIAL", level: "SECRETARY", decision: "CLARIFICATION" }),

  t({ action: "forward_to_department", from: S.INITIAL_APPROVED, to: S.FORWARDED_TO_DEPT, roles: ["NS_SPARK"] }),
  t({ action: "begin_analysis", from: S.FORWARDED_TO_DEPT, to: S.DEPT_ANALYSIS, roles: ["HOD"] }),
  t({ action: "start_proposal", from: S.DEPT_ANALYSIS, to: S.PROPOSAL_DRAFT, roles: ["HOD", "FACULTY"] }),
  t({ action: "submit_proposal", from: S.PROPOSAL_DRAFT, to: S.PROPOSAL_SUBMITTED, roles: ["HOD", "FACULTY"] }),

  t({ action: "begin_proposal_review", from: S.PROPOSAL_SUBMITTED, to: S.PROPOSAL_REVIEW, roles: ["NS_SPARK"] }),
  t({ action: "forward_proposal", from: S.PROPOSAL_REVIEW, to: S.PENDING_PRINCIPAL_FINAL, roles: ["NS_SPARK"], stage: "FINAL", level: "NS_SPARK", decision: "FORWARDED" }),
  t({ action: "return_proposal", from: S.PROPOSAL_REVIEW, to: S.PROPOSAL_DRAFT, roles: ["NS_SPARK"], remarksRequired: true, stage: "FINAL", level: "NS_SPARK", decision: "RETURNED" }),
  t({ action: "reject_proposal", from: S.PROPOSAL_REVIEW, to: S.REJECTED, roles: ["NS_SPARK"], remarksRequired: true, stage: "FINAL", level: "NS_SPARK", decision: "REJECTED" }),

  t({ action: "principal_approve_final", from: S.PENDING_PRINCIPAL_FINAL, to: S.PENDING_SECRETARY_FINAL, roles: ["PRINCIPAL"], stage: "FINAL", level: "PRINCIPAL", decision: "APPROVED" }),
  t({ action: "principal_revise_final", from: S.PENDING_PRINCIPAL_FINAL, to: S.PROPOSAL_DRAFT, roles: ["PRINCIPAL"], remarksRequired: true, stage: "FINAL", level: "PRINCIPAL", decision: "REVISION" }),
  t({ action: "principal_reject_final", from: S.PENDING_PRINCIPAL_FINAL, to: S.REJECTED, roles: ["PRINCIPAL"], remarksRequired: true, stage: "FINAL", level: "PRINCIPAL", decision: "REJECTED" }),

  t({ action: "secretary_approve_final", from: S.PENDING_SECRETARY_FINAL, to: S.FINAL_APPROVED, roles: ["SECRETARY"], stage: "FINAL", level: "SECRETARY", decision: "APPROVED" }),
  t({ action: "secretary_revise_final", from: S.PENDING_SECRETARY_FINAL, to: S.PROPOSAL_DRAFT, roles: ["SECRETARY"], remarksRequired: true, stage: "FINAL", level: "SECRETARY", decision: "REVISION" }),
  t({ action: "secretary_reject_final", from: S.PENDING_SECRETARY_FINAL, to: S.REJECTED, roles: ["SECRETARY"], remarksRequired: true, stage: "FINAL", level: "SECRETARY", decision: "REJECTED" }),

  t({ action: "add_to_register", from: S.FINAL_APPROVED, to: S.IN_REGISTER, roles: ["NS_SPARK"] }),
  t({ action: "forward_for_execution", from: S.IN_REGISTER, to: S.FORWARDED_FOR_EXECUTION, roles: ["NS_SPARK"] }),
  t({ action: "begin_allocation", from: S.FORWARDED_FOR_EXECUTION, to: S.ALLOCATION, roles: ["HOD", "FACULTY"] }),
  t({ action: "confirm_team", from: S.ALLOCATION, to: S.READY_TO_START, roles: ["HOD", "FACULTY"] }),
  t({ action: "commence", from: S.READY_TO_START, to: S.ONGOING, roles: ["HOD", "FACULTY"] }),
  t({ action: "hold", from: S.ONGOING, to: S.ON_HOLD, roles: ["HOD", "NS_SPARK"], remarksRequired: true }),
  t({ action: "resume", from: S.ON_HOLD, to: S.ONGOING, roles: ["HOD", "NS_SPARK"] }),
  t({ action: "complete", from: S.ONGOING, to: S.COMPLETED, roles: ["HOD", "NS_SPARK"], remarksRequired: true }),
];

// Cancellation allowed from any non-terminal state.
const TERMINAL: Status[] = [S.COMPLETED, S.REJECTED, S.CANCELLED];
for (const from of Object.values(S)) {
  if (!TERMINAL.includes(from)) {
    TRANSITIONS.push(t({ action: "cancel", from, to: S.CANCELLED, roles: ["NS_SPARK", "ADMIN"], remarksRequired: true }));
  }
}

export class WorkflowError extends Error {}

export function resolveTransition(from: string, action: string, role: Role, remarks?: string | null): Transition {
  const tr = TRANSITIONS.find((x) => x.action === action && x.from === from);
  if (!tr) throw new WorkflowError(`Action '${action}' is not allowed from status '${from}'`);
  if (!tr.roles.includes(role)) throw new WorkflowError(`Role ${role} may not perform '${action}'`);
  if (tr.remarksRequired && !remarks?.trim()) throw new WorkflowError(`Remarks are mandatory for '${action}'`);
  return tr;
}

export function availableActions(from: string, role: Role): Transition[] {
  return TRANSITIONS.filter((x) => x.from === from && x.roles.includes(role));
}
