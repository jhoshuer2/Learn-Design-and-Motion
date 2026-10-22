import { db } from "@/lib/db";

export type Mail = { to: string; subject: string; text: string };
export interface Mailer { send(mail: Mail): Promise<void> }

/** DEV/TEST: writes to a table so tests (and a developer) can read what would have been sent. */
class OutboxMailer implements Mailer {
  async send(m: Mail) { await db.emailOutbox.create({ data: m }); }
}

/** Real delivery through any SMTP server. NOT verified against a live server in this repository. */
class SmtpMailer implements Mailer {
  async send(m: Mail) {
    const { createTransport } = await import("nodemailer");
    const url = process.env.SMTP_URL;
    if (!url) throw new Error("SMTP_URL is not set");
    await createTransport(url).sendMail({ from: process.env.MAIL_FROM || "Creative Mastery <no-reply@localhost>", to: m.to, subject: m.subject, text: m.text });
  }
}

/**
 * EMAIL_TRANSPORT=smtp uses SMTP_URL; EMAIL_TRANSPORT=outbox uses the table. Unset means no mail leaves the system:
 * production without a transport configured reports "not configured" instead of pretending to send.
 */
export function getMailer(): Mailer | null {
  const t = process.env.EMAIL_TRANSPORT;
  if (t === "smtp") return new SmtpMailer();
  if (t === "outbox") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_OUTBOX_MAILER !== "true") throw new Error("The outbox mailer is dev/test only. Set ALLOW_OUTBOX_MAILER=true to enable it explicitly.");
    return new OutboxMailer();
  }
  return null;
}

export const appUrl = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");

/** Sends, and never throws to the caller: a mail failure must not reveal whether an account exists. Returns whether it was handed off. */
export async function trySend(mail: Mail, mailer: Mailer | null = getMailer()): Promise<boolean> {
  if (!mailer) { console.error("email not sent: no EMAIL_TRANSPORT configured"); return false; }
  try { await mailer.send(mail); return true; } catch (e) { console.error("email send failed:", e instanceof Error ? e.message : e); return false; }
}
