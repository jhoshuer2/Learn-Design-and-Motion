import { db } from "@/lib/db";
import { PortfolioError } from "./errors";

/**
 * A display name is what other people see. It must not leak an email address or contact details, so
 * anything that looks like one is refused. It is separate from the account name.
 */
export function validateDisplayName(input: string): string {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) throw new PortfolioError("invalid", "Use between 2 and 40 characters.");
  if (/[\u0000-\u001f\u007f<>]/.test(name)) throw new PortfolioError("invalid", "That name contains characters we cannot show.");
  if (/@|https?:|www\.|\.(com|net|org|io)\b/i.test(name)) throw new PortfolioError("invalid", "Do not put an email address or web address in your display name.");
  return name;
}

export async function setDisplayName(userId: string, input: string) {
  const displayName = validateDisplayName(input);
  await db.user.update({ where: { id: userId }, data: { displayName } });
  await db.auditEvent.create({ data: { actorId: userId, action: "profile.display_name", subject: `user:${userId}`, detail: {} } });
  return displayName;
}
