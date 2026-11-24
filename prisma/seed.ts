import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const pw = bcrypt.hashSync("Spark@123", 10);

async function main() {
  const nsec = await prisma.institution.upsert({ where: { code: "NSEC" }, update: {}, create: { code: "NSEC", name: "NS Engineering College" } });
  const ncas = await prisma.institution.upsert({ where: { code: "NCAS" }, update: {}, create: { code: "NCAS", name: "Nadar College of Arts and Science" } });
  const cse = await prisma.department.upsert({ where: { institutionId_name: { institutionId: nsec.id, name: "Computer Science & Engineering" } }, update: {}, create: { institutionId: nsec.id, name: "Computer Science & Engineering" } });
  await prisma.department.upsert({ where: { institutionId_name: { institutionId: nsec.id, name: "Electronics & Communication" } }, update: {}, create: { institutionId: nsec.id, name: "Electronics & Communication" } });
  await prisma.department.upsert({ where: { institutionId_name: { institutionId: ncas.id, name: "Computer Science" } }, update: {}, create: { institutionId: ncas.id, name: "Computer Science" } });

  const u = (email: string, name: string, role: string, extra: object = {}) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash: pw, ...extra } });
  await u("admin@nsspark.local", "System Admin", "ADMIN");
  await u("spark@nsspark.local", "NS Spark Officer", "NS_SPARK");
  await u("principal@nsspark.local", "Dr. Principal", "PRINCIPAL", { institutionId: nsec.id });
  await u("secretary@nsspark.local", "Mr. Secretary", "SECRETARY", { institutionId: nsec.id });
  const hod = await u("hod@nsspark.local", "Dr. HOD CSE", "HOD", { institutionId: nsec.id, departmentId: cse.id, employeeId: "F001" });
  await prisma.department.update({ where: { id: cse.id }, data: { hodId: hod.id } });
  await u("faculty@nsspark.local", "Prof. Faculty", "FACULTY", { institutionId: nsec.id, departmentId: cse.id, employeeId: "F002" });
  await u("student1@nsspark.local", "Student One", "STUDENT", { institutionId: nsec.id, departmentId: cse.id, registerNo: "21CS001", yearSem: "III/6" });
  await u("student2@nsspark.local", "Student Two", "STUDENT", { institutionId: nsec.id, departmentId: cse.id, registerNo: "21CS002", yearSem: "III/6" });
  console.log("Seeded. All demo passwords: Spark@123");
}
main().finally(() => prisma.$disconnect());
