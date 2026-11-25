import { NextResponse } from "next/server";
import { getFile } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { getSession, projectScope } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSession();
  if (!u) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const d = await prisma.projectDocument.findFirst({ where: { id, project: { deletedAt: null, ...projectScope(u) } } });
  if (!d) return new NextResponse("Not found", { status: 404 });
  let buf: Buffer;
  try { buf = await getFile(d.storedPath); } catch { return new NextResponse("File unavailable", { status: 502 }); }
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": d.mimeType, "Content-Disposition": `attachment; filename="${encodeURIComponent(d.fileName)}"`, "X-Content-Type-Options": "nosniff" } });
}
