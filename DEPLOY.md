# Deploying NS Spark (Vercel + Supabase)

Database: Supabase project `rockhhdtgtsbsppinepr`, schema `nsspark`. Documents: private Supabase Storage bucket `nsspark-docs`.

## 1. One-time database setup (from your computer)
1. Supabase Dashboard > Project Settings > Database > **Reset database password**.
2. Dashboard > **Connect** > copy two strings and put them in a local `.env` (see `.env.example`), keeping `?schema=nsspark`:
   - `DATABASE_URL`: Transaction pooler (port 6543), add `&pgbouncer=true`
   - `DIRECT_URL`: Session pooler (port 5432); the `db.<ref>.supabase.co` host is IPv6-only and often unreachable
3. Run:
   ```
   npm install
   npx prisma migrate resolve --applied 0_init     # tables already exist in Supabase
   ```
4. Remove the demo users, then create your real admin (demo password `Spark@123` is public):
   In the Supabase SQL editor, run (in this order):
   ```sql
   UPDATE nsspark."Department" SET "hodId" = NULL;
   DELETE FROM nsspark."User" WHERE email LIKE '%@nsspark.local';
   ```
   Then in PowerShell:
   ```
   $env:ADMIN_EMAIL="you@yourdomain.com"; $env:ADMIN_PASSWORD="a-long-strong-password"; npm run seed:prod
   ```
   Then sign in as admin and create departments and users from **Users & Master Data**.

## 2. Deploy on Vercel
1. vercel.com > Add New > Project > import `vigneshls/ns-spark` (framework: Next.js, auto-detected; region `bom1` is set in `vercel.json`).
2. Environment variables (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | pooled string (port 6543, `?schema=nsspark&pgbouncer=true`) |
| `DIRECT_URL` | session pooler string (port 5432, `?schema=nsspark`) |
| `SESSION_SECRET` | random string, 32+ chars (e.g. `openssl rand -base64 48`) |
| `SUPABASE_URL` | `https://rockhhdtgtsbsppinepr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard > Project Settings > API keys > **service_role / secret** key. Server-only; never prefix with `NEXT_PUBLIC_` |

3. Deploy. Vercel shows the live URL. Check `https://<your-url>/api/health` returns `{"status":"ok"}`.

## Notes
- Failed-login limiter (5 per 15 min per email and IP) is in-memory, so it is per server instance.
- Back up: Supabase daily backups (paid plans) or `pg_dump` of the `nsspark` schema; documents live in the `nsspark-docs` bucket.
- Existing public-schema functions in this Supabase project (`can_edit_project`, `my_role`, …) belong to another app and are callable by signed-in API users; review them separately.
- Local dev without Supabase Storage keys stores uploads in `./storage`; production refuses to start uploads without the keys.
