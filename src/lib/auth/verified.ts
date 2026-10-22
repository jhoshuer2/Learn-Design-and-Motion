import { db } from "@/lib/db";

export const UNVERIFIED_MESSAGE = "Confirm your email address first. You can do that from your profile.";

/** True when the person has proved control of their address. Missing accounts count as unverified. */
export async function isVerified(userId: string): Promise<boolean> {
  return !!(await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } }))?.emailVerifiedAt;
}
