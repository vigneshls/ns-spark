import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const u = await prisma.user.findFirst({ where: { email, active: true, deletedAt: null } });
  const ok = u && (await bcrypt.compare(String(formData.get("password") ?? ""), u.passwordHash));
  if (!u || !ok) redirect("/login?error=1");
  await createSession(u.id);
  redirect("/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form action={login} className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">NS Spark</h1>
          <p className="text-sm text-slate-500">Project Management &amp; Monitoring System</p>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">Invalid email or password.</p>}
        <label className="block text-sm">Email
          <input name="email" type="email" required className="mt-1 w-full border rounded-md px-3 py-2" /></label>
        <label className="block text-sm">Password
          <input name="password" type="password" required className="mt-1 w-full border rounded-md px-3 py-2" /></label>
        <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-md py-2 font-medium">Sign in</button>
        {process.env.NODE_ENV !== "production" && (
          <p className="text-xs text-slate-400">Demo: spark@ / principal@ / secretary@ / hod@ / faculty@ / student1@ / admin@ nsspark.local — Spark@123</p>
        )}
      </form>
    </main>
  );
}
