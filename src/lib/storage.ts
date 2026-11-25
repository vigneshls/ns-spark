import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Supabase Storage (private bucket) when configured, local ./storage folder otherwise (dev only).
// SUPABASE_SERVICE_ROLE_KEY is server-only: never expose it with a NEXT_PUBLIC_ prefix.
const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET ?? "nsspark-docs";
const remote = !!(URL_ && KEY);
const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${KEY}`, apikey: KEY!, ...extra });

export async function putFile(name: string, data: Buffer, contentType: string): Promise<string> {
  if (remote) {
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, { method: "POST", headers: headers({ "Content-Type": contentType }), body: new Uint8Array(data) });
    if (!r.ok) throw new Error(`Storage upload failed (${r.status})`);
    return `sb:${name}`;
  }
  if (process.env.NODE_ENV === "production") throw new Error("File storage is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  const dir = path.join(process.cwd(), "storage");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), data);
  return name;
}

export async function getFile(stored: string): Promise<Buffer> {
  if (stored.startsWith("sb:")) {
    if (!remote) throw new Error("File storage is not configured");
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${encodeURIComponent(stored.slice(3))}`, { headers: headers() });
    if (!r.ok) throw new Error(`Storage download failed (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  return readFile(path.join(process.cwd(), "storage", path.basename(stored)));
}
