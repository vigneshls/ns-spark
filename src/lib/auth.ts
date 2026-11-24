import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/services/workflow";
import type { Role } from "@/lib/workflow/machine";

const COOKIE = "nss_session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-only-secret-change-me-please-0000");

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("8h").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
}
export async function destroySession() { (await cookies()).delete(COOKIE); }

export interface SessionUser extends Actor { name: string; email: string }

/** Re-reads the user from the DB on each request so deactivation/role changes apply immediately. */
export async function getSession(): Promise<SessionUser | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    const u = await prisma.user.findFirst({ where: { id: String(payload.uid), active: true, deletedAt: null } });
    if (!u) return null;
    return { id: u.id, role: u.role as Role, institutionId: u.institutionId, departmentId: u.departmentId, name: u.name, email: u.email };
  } catch { return null; }
}

export async function requireUser(roles?: Role[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/dashboard");
  return s;
}

/** Row-level visibility for projects (institution / department / membership isolation). */
export function projectScope(s: SessionUser) {
  switch (s.role) {
    case "ADMIN": case "NS_SPARK": return {};
    case "PRINCIPAL": case "SECRETARY": return { institutionId: s.institutionId ?? "__none__" };
    // departments only see a project after NS Spark forwards it (stage 4)
    case "HOD": return { departmentId: s.departmentId ?? "__none__", status: { notIn: ["DRAFT", "REGISTERED", "UNDER_NS_SPARK_INITIAL_REVIEW", "PENDING_PRINCIPAL_INITIAL_APPROVAL", "PENDING_SECRETARY_INITIAL_APPROVAL", "INITIAL_APPROVAL_COMPLETED"] } };
    default: return { members: { some: { userId: s.id, active: true } } };
  }
}
