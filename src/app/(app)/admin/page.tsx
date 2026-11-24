import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, btnCls, btnGhost, inputCls, label } from "@/components/ui";

const ROLES = ["ADMIN", "NS_SPARK", "PRINCIPAL", "SECRETARY", "HOD", "FACULTY", "STUDENT"] as const;
const userSchema = z.object({
  name: z.string().min(2), email: z.string().email(), role: z.enum(ROLES), password: z.string().min(8),
  institutionId: z.string().optional(), departmentId: z.string().optional(), employeeId: z.string().optional(), registerNo: z.string().optional(), yearSem: z.string().optional(),
});

async function createUser(f: FormData) {
  "use server";
  const a = await requireUser(["ADMIN"]);
  const r = userSchema.safeParse(Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v) || undefined])));
  if (!r.success) redirect("/admin?err=" + encodeURIComponent(r.error.issues[0].message));
  const { password, ...rest } = r.data;
  try {
    const u = await prisma.user.create({ data: { ...rest, email: rest.email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10) } });
    if (u.role === "HOD" && u.departmentId) await prisma.department.update({ where: { id: u.departmentId }, data: { hodId: u.id } });
    await prisma.auditLog.create({ data: { userId: a.id, role: a.role, action: "create_user", remarks: u.email } });
  } catch { redirect("/admin?err=" + encodeURIComponent("Could not create user (duplicate email or HOD already assigned)")); }
  revalidatePath("/admin"); redirect("/admin?ok=User+created");
}
async function createDept(f: FormData) {
  "use server";
  const a = await requireUser(["ADMIN"]);
  try {
    await prisma.department.create({ data: { institutionId: String(f.get("institutionId")), name: String(f.get("name")).trim() } });
    await prisma.auditLog.create({ data: { userId: a.id, role: a.role, action: "create_department", remarks: String(f.get("name")) } });
  } catch { redirect("/admin?err=Could+not+create+department"); }
  revalidatePath("/admin"); redirect("/admin?ok=Department+created");
}
async function toggleUser(f: FormData) {
  "use server";
  const a = await requireUser(["ADMIN"]);
  const id = String(f.get("id")); if (id === a.id) redirect("/admin?err=You+cannot+deactivate+yourself");
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  await prisma.auditLog.create({ data: { userId: a.id, role: a.role, action: u.active ? "deactivate_user" : "activate_user", remarks: u.email } });
  revalidatePath("/admin"); redirect("/admin");
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser(["ADMIN"]);
  const { ok, err } = await searchParams;
  const [users, insts, depts] = await Promise.all([
    prisma.user.findMany({ where: { deletedAt: null }, include: { department: true, institution: true }, orderBy: { role: "asc" } }),
    prisma.institution.findMany(), prisma.department.findMany({ include: { institution: true } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users &amp; Master Data</h1>
      {ok && <p className="text-sm text-emerald-700 bg-emerald-50 rounded p-2">{ok}</p>}{err && <p className="text-sm text-red-700 bg-red-50 rounded p-2">{err}</p>}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Create user">
          <form action={createUser} className="grid grid-cols-2 gap-2">
            <input name="name" required placeholder="Full name" className={inputCls} /><input name="email" type="email" required placeholder="Email" className={inputCls} />
            <select name="role" className={inputCls}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select><input name="password" type="password" required minLength={8} placeholder="Initial password (min 8)" className={inputCls} />
            <select name="institutionId" className={inputCls}><option value="">Institution (n/a)</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.code}</option>)}</select>
            <select name="departmentId" className={inputCls}><option value="">Department (n/a)</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.institution.code} · {d.name}</option>)}</select>
            <input name="employeeId" placeholder="Faculty ID" className={inputCls} /><input name="registerNo" placeholder="Register No" className={inputCls} />
            <input name="yearSem" placeholder="Year / Semester" className={inputCls} /><button className={btnCls}>Create</button></form>
        </Card>
        <Card title="Institutions & departments">
          <ul className="text-sm mb-3">{insts.map((i) => <li key={i.id}><b>{i.name}</b><ul className="ml-4 list-disc text-slate-600">{depts.filter((d) => d.institutionId === i.id).map((d) => <li key={d.id}>{d.name}</li>)}</ul></li>)}</ul>
          <form action={createDept} className="flex gap-2"><select name="institutionId" className={inputCls + " max-w-[8rem]"}>{insts.map((i) => <option key={i.id} value={i.id}>{i.code}</option>)}</select>
            <input name="name" required placeholder="New department" className={inputCls} /><button className={btnGhost}>Add</button></form>
        </Card>
      </div>
      <Card title="Users"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Name</th><th>Email</th><th>Role</th><th>Institution / Dept</th><th></th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id} className="border-t"><td className="py-1">{u.name}</td><td>{u.email}</td><td>{label(u.role)}</td><td>{u.institution?.code ?? ""} {u.department?.name ?? ""}</td>
          <td><form action={toggleUser}><input type="hidden" name="id" value={u.id} /><button className="text-xs text-indigo-600">{u.active ? "Deactivate" : "Activate"}</button></form></td></tr>)}
      </tbody></table></Card>
    </div>
  );
}
