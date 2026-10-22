import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export type SignupResult = { ok: true } | { ok: false; error: string };

/** Creates a LEARNER. The role is never taken from input. */
export async function createLearner(input: unknown): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    return { ok: false, error: "An account with this email already exists" };
  }
  const user = await db.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 12) },
  });
  await db.auditEvent.create({
    data: { actorId: user.id, action: "user.signup", subject: `user:${user.id}`, detail: {} },
  });
  return { ok: true };
}
