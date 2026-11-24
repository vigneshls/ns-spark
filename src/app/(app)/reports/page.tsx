import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { REPORTS, buildReport } from "@/lib/reports";
import { Card, inputCls, btnGhost, label } from "@/components/ui";
import { STATUS as S } from "@/lib/workflow/machine";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser(["ADMIN", "NS_SPARK", "PRINCIPAL", "SECRETARY", "HOD"]);
  const sp = await searchParams;
  const key = sp.report && REPORTS[sp.report] ? sp.report : "projects";
  const [insts, depts] = await Promise.all([prisma.institution.findMany(), prisma.department.findMany({ where: { deletedAt: null } })]);
  const t = await buildReport(key, u, sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "report") as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reports &amp; Analytics</h1>
      <form className="flex flex-wrap gap-2 items-end">
        <select name="report" defaultValue={key} className={inputCls + " max-w-xs"}>{Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="institution" defaultValue={sp.institution ?? ""} className={inputCls + " max-w-[12rem]"}><option value="">All institutions</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.code}</option>)}</select>
        <select name="department" defaultValue={sp.department ?? ""} className={inputCls + " max-w-[12rem]"}><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className={inputCls + " max-w-[12rem]"}><option value="">Any status</option>{Object.values(S).map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
        <input name="q" defaultValue={sp.q} placeholder="Search" className={inputCls + " max-w-[10rem]"} />
        <input type="date" name="from" defaultValue={sp.from} className={inputCls + " max-w-[10rem]"} /><input type="date" name="to" defaultValue={sp.to} className={inputCls + " max-w-[10rem]"} />
        <button className={btnGhost}>Run</button>
        <a className={btnGhost} href={`/api/export/${key}?${qs}`}>Excel</a>
        <a className={btnGhost} href={`/api/export/${key}?${qs}&format=pdf`}>PDF</a>
      </form>
      <Card title={t?.title}>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500">{t?.columns.map((c) => <th key={c} className="py-1 pr-3">{c}</th>)}</tr></thead>
          <tbody>{t?.rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="py-1 pr-3 align-top">{String(c)}</td>)}</tr>)}
            {!t?.rows.length && <tr><td className="py-4 text-slate-400">No data.</td></tr>}</tbody></table></div>
      </Card>
      <p className="text-xs text-slate-400">Use your browser’s print function (Ctrl+P) for a printable copy.</p>
    </div>
  );
}
