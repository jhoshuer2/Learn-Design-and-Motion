import { z } from "zod";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, MAX_PASSWORD, MIN_PASSWORD } from "@/lib/auth/password";
import { AUTH_LIMITS, sendVerification } from "@/lib/auth/account";
import { hit } from "@/lib/ratelimit";

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`).max(MAX_PASSWORD),
});

export type SignupResult = { ok: true } | { ok: false; error: string };

/** Creates a LEARNER. The role is never taken from input. */
export async function createLearner(input: unknown, clientSubject = "shared"): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, password } = parsed.data;
  const weak = checkPassword(password, { email, name });
  if (weak) return { ok: false, error: weak };
  if (!(await hit(clientSubject, AUTH_LIMITS.signup())).allowed) return { ok: false, error: "Too many accounts were created from your network recently. Please try again later." };
  if (await db.user.findUnique({ where: { email } })) {
    return { ok: false, error: "An account with this email already exists" };
  }
  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
  await db.auditEvent.create({
    data: { actorId: user.id, action: "user.signup", subject: `user:${user.id}`, detail: {} },
  });
  // Best effort: a mail problem must not stop sign-up. The profile page offers "send it again".
  await sendVerification(user.id).catch(() => undefined);
  return { ok: true };
}
