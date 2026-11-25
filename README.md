# NS Spark

Institutional project management, approval and monitoring system (Next.js 15, Prisma, Supabase PostgreSQL).

## Database
Supabase project `rockhhdtgtsbsppinepr`, schema `nsspark` (the project's `public` schema belongs to another app and is untouched).
Tables are created and demo data is loaded already. RLS is enabled with no policies, so Supabase's public API cannot read them; only the app's database connection can.

## Setup
1. Supabase Dashboard > Connect > ORM: copy the pooled and direct connection strings.
2. Edit `.env` (template: `.env.example`) and replace `[YOUR-PASSWORD]` in both URLs. Keep `?schema=nsspark`.
3. Tell Prisma the baseline migration is already applied, then run:
```
npm install
npx prisma migrate resolve --applied 0_init
npm run dev          # http://localhost:3000
```
Demo logins: admin@, spark@, principal@, secretary@, hod@, faculty@, student1@, student2@ `nsspark.local`, password `Spark@123`. Delete or change these before real use.

## Tests
Use a separate schema so test data never touches real data: set `DATABASE_URL`/`DIRECT_URL` with `?schema=nsspark_test`, then `npx prisma migrate deploy && npm run seed && npm test`.

## Production
- Set `SESSION_SECRET` (long random).
- Uploaded files live in `./storage` (move to Supabase Storage if deploying to a host without persistent disk).
- Deployment guide: `DEPLOY.md`. Design docs: `docs/ARCHITECTURE.md`.
