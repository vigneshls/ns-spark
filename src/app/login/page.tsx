import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isLocked, recordFail, clearFails } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const keys = [`e:${email}`, `i:${ip}`];
  if (keys.some(isLocked)) redirect("/login?error=locked");
  const u = await prisma.user.findFirst({ where: { email, active: true, deletedAt: null } });
  // always run a bcrypt compare so response time doesn't reveal whether the email exists
  const ok = await bcrypt.compare(String(formData.get("password") ?? ""), u?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!u || !ok) { keys.forEach(recordFail); redirect("/login?error=1"); }
  keys.forEach(clearFails);
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
        {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error === "locked" ? "Too many failed attempts. Try again in 15 minutes." : "Invalid email or password."}</p>}
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
