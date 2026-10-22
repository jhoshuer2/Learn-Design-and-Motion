import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

/**
 * In-app notices only (there is no email provider). Written inside the same transaction as the decision they report.
 * Text is plain and never names who reported anything.
 */
export async function notify(client: Client, userId: string, kind: string, text: string, subjectId?: string) {
  await client.notification.create({ data: { userId, kind, text: text.slice(0, 500), subjectId: subjectId ?? null } });
}

export const listMine = (userId: string, take = 50) =>
  db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
