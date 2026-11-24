import Link from "next/link";

export const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase());

const tone = (s: string) =>
  /REJECTED|CANCELLED/.test(s) ? "bg-red-100 text-red-700"
  : /COMPLETED|APPROVED|REGISTER/.test(s) && !/PENDING/.test(s) ? "bg-emerald-100 text-emerald-700"
  : /PENDING|REVIEW|SUBMITTED/.test(s) ? "bg-amber-100 text-amber-800"
  : /ONGOING/.test(s) ? "bg-blue-100 text-blue-700"
  : "bg-slate-100 text-slate-700";

export function Badge({ s }: { s: string }) {
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${tone(s)}`}>{label(s)}</span>;
}

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      {(title || right) && <div className="flex justify-between items-center mb-3"><h2 className="font-medium text-slate-800">{title}</h2>{right}</div>}
      {children}
    </section>
  );
}

export function Kpi({ title, value, href }: { title: string; value: number | string; href?: string }) {
  const body = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{title}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Bars({ data }: { data: { name: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!data.length) return <p className="text-sm text-slate-400">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.name} className="text-xs">
          <div className="flex justify-between"><span className="text-slate-600">{d.name}</span><span>{d.n}</span></div>
          <div className="h-2 bg-slate-100 rounded"><div className="h-2 bg-indigo-500 rounded" style={{ width: `${(d.n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export const inputCls = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white";
export const btnCls = "px-3 py-1.5 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700";
export const btnGhost = "px-3 py-1.5 rounded-md text-sm font-medium border border-slate-300 hover:bg-slate-50";
export const btnDanger = "px-3 py-1.5 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700";
