import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession, projectScope } from "@/lib/auth";

const MAX = 10 * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  ".pdf": ["application/pdf"], ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".xls": ["application/vnd.ms-excel"], ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".png": ["image/png"], ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"],
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSession();
  if (!u) return NextResponse.redirect(new URL("/login", req.url), 303);
  const { id } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/projects/${id}?${q}`, req.url), 303);
  const p = await prisma.project.findFirst({ where: { id, deletedAt: null, ...projectScope(u) } });
  if (!p || !["NS_SPARK", "HOD", "FACULTY"].includes(u.role)) return back("err=Not+authorized");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) return back("err=No+file+selected");
  if (file.size > MAX) return back("err=File+exceeds+10+MB");
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED[ext] || !ALLOWED[ext].includes(file.type)) return back("err=File+type+not+allowed");
  const dir = path.join(process.cwd(), "storage");
  await mkdir(dir, { recursive: true });
  const stored = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, stored), Buffer.from(await file.arrayBuffer()));
  await prisma.projectDocument.create({ data: { projectId: id, fileName: path.basename(file.name), mimeType: file.type, size: file.size, storedPath: stored, uploadedBy: u.id } });
  await prisma.auditLog.create({ data: { userId: u.id, role: u.role, action: "upload_document", projectId: id, remarks: file.name } });
  return back("ok=Document+uploaded");
}
