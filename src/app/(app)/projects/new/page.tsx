import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createProject } from "../actions";
import { Card, inputCls, btnCls } from "@/components/ui";

function F({ n, l, req = true, type = "text", area = false }: { n: string; l: string; req?: boolean; type?: string; area?: boolean }) {
  return (
    <label className="block text-sm">{l}{req && <span className="text-red-500"> *</span>}
      {area ? <textarea name={n} required={req} rows={3} className={inputCls + " mt-1"} /> : <input name={n} type={type} required={req} className={inputCls + " mt-1"} />}
    </label>
  );
}

export default async function NewProject({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireUser(["NS_SPARK"]);
  const { err } = await searchParams;
  const insts = await prisma.institution.findMany({ where: { deletedAt: null } });
  return (
    <form action={createProject} className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Register External Project</h1>
      {err && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{err}</p>}
      <Card title="1. Institution">
        <select name="institutionId" required className={inputCls}><option value="">Select institution…</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
      </Card>
      <Card title="2. Client information">
        <div className="grid md:grid-cols-2 gap-3">
          <F n="c_name" l="Client / Organization Name" /><F n="c_type" l="Organization Type" /><F n="c_contact" l="Contact Person" /><F n="c_desig" l="Designation" />
          <F n="c_mobile" l="Mobile Number" /><F n="c_email" l="Email Address" type="email" /><F n="c_address" l="Organization Address" /><F n="c_city" l="City" />
          <F n="c_state" l="State" /><F n="c_country" l="Country" /><F n="c_web" l="Website" req={false} />
        </div>
      </Card>
      <Card title="3. Project information">
        <div className="grid md:grid-cols-2 gap-3">
          <F n="title" l="Project Title" /><F n="category" l="Project Category" />
          <F n="description" l="Project Description" area /><F n="requirements" l="Detailed Requirements" area /><F n="problem" l="Problem Statement" area /><F n="deliverables" l="Expected Deliverables" area />
          <F n="preferredTech" l="Preferred Technology" req={false} /><F n="expectedBudget" l="Expected Budget" req={false} type="number" />
          <F n="expectedDays" l="Expected Duration (days)" req={false} type="number" /><F n="expectedEnd" l="Expected Completion Date" req={false} type="date" />
          <F n="expectations" l="Client Expectations" req={false} area /><F n="remarks" l="Additional Remarks" req={false} area />
        </div>
        <p className="text-xs text-slate-500 mt-3">Supporting documents can be attached from the project page after registration.</p>
      </Card>
      <button className={btnCls}>Save as Draft</button>
    </form>
  );
}
