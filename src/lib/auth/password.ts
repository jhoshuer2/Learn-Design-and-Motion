import bcrypt from "bcryptjs";

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

/** A short list of the passwords people actually pick. A weak guard, not a breach-corpus check. */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "1234567890", "12345678910", "qwertyuiop", "qwerty123",
  "iloveyou12", "letmein123", "welcome123", "admin12345", "administrator", "abc1234567", "1q2w3e4r5t", "0123456789", "football12",
  "monkey1234", "dragon1234", "creativemastery", "creative123", "changeme123", "trustno1234",
]);

/** Returns a reason the password is unacceptable, or null. */
export function checkPassword(password: string, ctx: { email?: string; name?: string } = {}): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Choose something less guessable";
  if (/^(.)\1+$/.test(password)) return "That password is too repetitive. Choose something less guessable";
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Your password should not contain your email name";
  const name = ctx.name?.trim().toLowerCase();
  if (name && name.length >= 4 && lower.includes(name)) return "Your password should not contain your name";
  return null;
}

/** Cost 12 is the existing hash cost; tests lower it through BCRYPT_ROUNDS. */
export const hashPassword = (pw: string) => bcrypt.hash(pw, Number(process.env.BCRYPT_ROUNDS ?? 12));

/** Compared when no such account exists, so "unknown email" costs the same time as "wrong password". */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("not-a-real-password-for-timing"));
