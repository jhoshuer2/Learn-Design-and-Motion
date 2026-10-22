# Account security (M8)

## What exists
| Control | Behaviour | Where |
|---|---|---|
| Password policy | 10 to 200 characters; refuses a short list of common passwords, all-one-character passwords, and passwords containing the email name or the person's name. Stored with bcrypt (cost 12). | `lib/auth/password.ts` |
| Sign-in throttling | Failed attempts counted per account (8 per 15 min) **and** per client (40 per 15 min). Over either limit, sign-in is refused without checking the password, even a correct one. A success clears the account counter. Counters key on a hash of the email, never the email. | `lib/auth/throttle.ts`, `auth.ts` |
| Timing | An unknown email costs one bcrypt comparison against a dummy hash, so response time does not reveal which emails exist. | `auth.ts` |
| Email verification | Signup mails a 48-hour link. Opening it shows a button; only pressing it verifies, so a mail scanner or link preview cannot spend it. Sharing (link or Public), peer feedback, reports and appeals need a verified email; learning, submitting and assessment do not. Making work private again never needs it. | `lib/auth/account.ts`, `lib/auth/verified.ts` |
| Password reset | Request answers identically for known, unknown and malformed addresses; limited per client (10/h) and per address (3/h), silently. One-hour, single-use link; the newest link replaces older ones. A weak new password is refused without burning the link. Resetting proves control of the address (marks it verified), ends every session and sends a "password changed" notice. | `lib/auth/account.ts` |
| Change password / sign out everywhere | Needs the current password; ends every session, including the current one. | profile page |
| Sessions | The JWT records `tokenVersion`; any change bumps it and older sessions stop working on their next request. Role is still read from the database. | `auth.ts` |
| Tokens | 256 random bits, only the SHA-256 stored, single use, expiring, bound to one purpose, spent atomically. | `lib/auth/tokens.ts` |
| Headers | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`; HSTS only when `ENABLE_HSTS=true`; `X-Powered-By` removed. | `next.config.mjs` |
| Mail | One `Mailer` interface: SMTP (nodemailer) or a dev/test table outbox. With no transport configured nothing is sent and the profile page says so. A mail failure never reaches the caller (so it cannot reveal whether an account exists). | `lib/auth/mailer.ts` |

## Operating it
- Set `EMAIL_TRANSPORT=smtp`, `SMTP_URL`, `MAIL_FROM` and `APP_URL` on the web app. Without them, new users cannot verify and nobody can reset a password by themselves.
- A locked-out person waits for the 15-minute window to end or uses "forgot password" (a reset link is not blocked by the sign-in lock, and a successful reset does not clear it, only a successful sign-in does).
- To rotate sessions for everyone, bump `tokenVersion` for all users in SQL.
- Existing accounts created before M8 are **unverified** and their old sessions were ended once by the upgrade (they carry no session version).

## Not built / known gaps
- **The SMTP adapter has never been run against a real mail server.** It is a thin wrapper over nodemailer; test it with real credentials before relying on it.
- No two-factor authentication, passkeys or OAuth sign-in; no breached-password (HIBP) check; no password-strength estimator beyond the rules above.
- Signup still says "An account with this email already exists" (the only way to tell someone their address is taken without email-first signup). It is rate limited per client but it does reveal registered addresses.
- Sign-in throttling can be used to lock a known person out for 15 minutes (the cost of per-account limits). No CAPTCHA.
- Rate limits are per hashed client address and only meaningful behind a proxy you control (`TRUST_PROXY=true`); otherwise all clients share one bucket.
- No Content-Security-Policy yet (Next's inline scripts need a nonce setup); no audit screen for security events (they are in `AuditEvent`); no email-change flow; no admin tool to force a password reset or unlock an account (use SQL).
- Reviewer/admin roles are still granted only with `npm run user:role`.
