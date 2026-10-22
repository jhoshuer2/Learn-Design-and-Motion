import { PrismaClient, type Role } from "@prisma/client";

/** Usage: npm run user:role -- <email> <LEARNER|REVIEWER|AUTHOR|ADMIN>. Roles are never settable from the web UI. */
const [email, role] = process.argv.slice(2);
const ROLES: Role[] = ["LEARNER", "REVIEWER", "AUTHOR", "ADMIN"];

async function main() {
  if (!email || !ROLES.includes(role as Role)) {
    console.error("Usage: npm run user:role -- <email> <LEARNER|REVIEWER|AUTHOR|ADMIN>");
    process.exit(1);
  }
  const db = new PrismaClient();
  try {
    const user = await db.user.update({ where: { email: email.toLowerCase() }, data: { role: role as Role } });
    await db.auditEvent.create({ data: { actorId: null, action: "user.role_changed", subject: `user:${user.id}`, detail: { role, via: "cli" } } });
    console.log(`${user.email} is now ${role}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
