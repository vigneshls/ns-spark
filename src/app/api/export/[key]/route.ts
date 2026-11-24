import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getSession } from "@/lib/auth";
import { buildReport } from "@/lib/reports";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const u = await getSession();
  if (!u) return new NextResponse("Unauthorized", { status: 401 });
  const { key } = await params;
  const url = new URL(req.url);
  const f = Object.fromEntries(url.searchParams) as Record<string, string>;
  const t = await buildReport(key === "projects" && f.view === "approved" ? "approved" : key, u, f);
  if (!t) return new NextResponse("Unknown report", { status: 404 });
  const stamp = new Date().toISOString().slice(0, 10);

  if (f.format === "pdf") {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on("end", () => r()));
    doc.fontSize(14).text(`NS Spark — ${t.title}`).fontSize(8).fillColor("#666").text(`Generated ${stamp} by ${u.name}`).moveDown().fillColor("#000");
    const w = (doc.page.width - 60) / t.columns.length;
    const line = (cells: (string | number)[], bold = false) => {
      const y = doc.y; doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7);
      let h = 0;
      cells.forEach((c, i) => { doc.text(String(c).slice(0, 120), 30 + i * w, y, { width: w - 4 }); h = Math.max(h, doc.y - y); });
      doc.y = y + h + 3;
      if (doc.y > doc.page.height - 50) doc.addPage();
    };
    line(t.columns, true); t.rows.forEach((r) => line(r));
    doc.end(); await done;
    return new NextResponse(Buffer.concat(chunks), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${key}-${stamp}.pdf"` } });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.title.slice(0, 31));
  ws.addRow(t.columns).font = { bold: true };
  // neutralise spreadsheet formula injection
  t.rows.forEach((r) => ws.addRow(r.map((c) => (typeof c === "string" && /^[=+\-@]/.test(c) ? `'${c}` : c))));
  ws.columns.forEach((c) => (c.width = 22));
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${key}-${stamp}.xlsx"` } });
}
