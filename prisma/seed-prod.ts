// Production bootstrap: the two institutions + one admin account. No demo users.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-strong-password' npm run seed:prod
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 characters)");
  await prisma.institution.upsert({ where: { code: "NSEC" }, update: {}, create: { code: "NSEC", name: "NS Engineering College" } });
  await prisma.institution.upsert({ where: { code: "NCAS" }, update: {}, create: { code: "NCAS", name: "Nadar College of Arts and Science" } });
  await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, name: "System Administrator", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Bootstrapped institutions and admin ${email}. Add departments and users from the Admin screen.`);
}
main().finally(() => prisma.$disconnect());
