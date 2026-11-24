import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, destroySession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { label } from "@/components/ui";
import type { Role } from "@/lib/workflow/machine";

const NAV: Record<Role, [string, string][]> = {
  ADMIN: [["Dashboard", "/dashboard"], ["Projects", "/projects"], ["Users & Master Data", "/admin"], ["Audit Log", "/audit"], ["Reports", "/reports"]],
  NS_SPARK: [["Dashboard", "/dashboard"], ["Register Project", "/projects/new"], ["Projects", "/projects"], ["Approved Register", "/projects?view=approved"], ["Timesheet Reports", "/timesheets"], ["Reports", "/reports"], ["Audit Log", "/audit"]],
  PRINCIPAL: [["Dashboard", "/dashboard"], ["Pending Approvals", "/projects?view=pending"], ["Projects", "/projects"], ["Progress Reports", "/timesheets"], ["Reports", "/reports"]],
  SECRETARY: [["Dashboard", "/dashboard"], ["Pending Approvals", "/projects?view=pending"], ["Projects", "/projects"], ["Progress Reports", "/timesheets"], ["Reports", "/reports"]],
  HOD: [["Dashboard", "/dashboard"], ["Projects", "/projects"], ["Timesheet Review", "/timesheets"], ["Reports", "/reports"]],
  FACULTY: [["Dashboard", "/dashboard"], ["My Projects", "/projects"], ["Timesheets", "/timesheets"]],
  STUDENT: [["Dashboard", "/dashboard"], ["My Projects", "/projects"], ["My Timesheets", "/timesheets"]],
};

async function logout() { "use server"; await destroySession(); redirect("/login"); }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await prisma.notification.count({ where: { userId: user.id, read: false } });
  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      <aside className="hidden md:block w-56 bg-slate-900 text-slate-200 p-4 shrink-0">
        <div className="text-lg font-semibold text-white mb-6">NS Spark</div>
        <nav className="space-y-1">
          {NAV[user.role].map(([t, h]) => (
            <Link key={h} href={h} className="block px-3 py-2 rounded-md text-sm hover:bg-slate-800">{t}</Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <form action="/projects" className="flex-1 max-w-md">
            <input name="q" placeholder="Search projects, clients, IDs…" className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
          </form>
          <Link href="/notifications" className="relative text-sm px-2 py-1 rounded hover:bg-slate-100">
            Notifications{unread > 0 && <span className="ml-1 bg-red-600 text-white text-xs rounded-full px-1.5">{unread}</span>}
          </Link>
          <div className="text-right leading-tight">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-slate-500">{label(user.role)}</div>
          </div>
          <form action={logout}><button className="text-sm px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Sign out</button></form>
        </header>
        <div className="md:hidden bg-white border-b px-2 py-1 flex gap-2 overflow-x-auto text-xs">
          {NAV[user.role].map(([t, h]) => <Link key={h} href={h} className="px-2 py-1 whitespace-nowrap">{t}</Link>)}
        </div>
        <main className="p-4 md:p-6 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
