# Safety controls (M7)

What exists to keep shared work safe, what each control does and does not do, and how reviewers operate it. Read with `PRIVACY_AND_SHARING.md`.

## Controls
| Risk | Control | Where | Limits |
|---|---|---|---|
| Unsuitable image or text goes public | **Pre-moderation.** Setting Public makes the project `PENDING`; it is unreachable by anyone but the owner (page, images, gallery, handle page) until a reviewer approves. Approval is bound to a fingerprint of exactly what the reviewer saw; any later change to title, introduction, shown images, rationale visibility or evidence visibility sends it back to `PENDING`. | `portfolio/access.ts`, `index.ts`, `moderation.ts` | A person's judgement; no automated image check exists. |
| Unsuitable image or text by link | None beyond the content policy, text screening and reports. **Link-only is not pre-moderated** and is world-readable to anyone with the link. | | Deliberate trade-off chosen for this milestone. |
| Contact details and links in shared text | `screenText` refuses emails, web addresses and phone numbers in title, introduction, a shown rationale and peer feedback; blocklisted terms (`CONTENT_BLOCKLIST` plus a short built-in list) are refused for link sharing and shown to the reviewer for Public. | `safety/screen.ts` | A weak filter. Misses anything clever (spaced-out text, images of text, social handles). |
| Images | `ImageScreener` interface with a no-op default; the verdict ("not screened") is shown to the reviewer. A vision-model or hash-match screener plugs in here, recorded next to the reviewer's decision, never instead of it. | `safety/images.ts` | **Not built.** |
| Abuse reports | Signed-in report on a project or feedback; anyone, signed in or not, can file a takedown request. Reviewer actions: hold (forced Private, cannot be re-shared), hide feedback, dismiss. Owners are told the decision and reason, never the reporter. | `peer.ts`, `safety/takedown.ts`, `/report-abuse`, `/review/takedowns` | No service-level promise; no appeal of a takedown. |
| Scraping and floods | DB-backed fixed-window rate limits on public pages, images and the report form, keyed by a hash of the client address (`x-forwarded-for` believed only when `TRUST_PROXY=true`). | `ratelimit/index.ts` | One DB write per anonymous read; clients behind one shared address share a bucket; not a DDoS defence. Pages cannot set an HTTP 429, so they render a "too many requests" screen with status 200; images and the API return a real 429. |
| Leaving | Account deletion (password and typed confirmation) removes everything the person made, including shared pages and stored files; de-identifies the audit log; refuses the last administrator. | `account/delete.ts` | No export; cannot reach copies others made or operator backups; stored-file removal is best-effort after commit (failures are logged by key). A deleted account's session ends because the JWT callback finds no user. |
| Retention of complainant details | Removed 90 days after a request is handled (`scrubOldContacts`, run hourly by the worker). | `safety/takedown.ts` | Requires a worker to be running. |

## Reviewer runbook
- **Public approvals** (`/review/moderation`): open each, look at every image and the text, read the automatic checks (they are hints, not clearance), approve or reject. Rejecting needs a reason the owner will read. You cannot decide on your own project; another reviewer must. If the owner changes anything while you are looking, your decision is refused and you review again.
- **Reports and takedowns:** hold takes the project down and tells the owner why; dismiss records that nothing was wrong. A hold stays until a reviewer lifts it, and the owner must then choose to share again (and Public needs approval again).
- **Anything involving a child, a credible threat or a legal demand** is outside what this tool can handle: preserve what you can, take the work down, and escalate to the site operator immediately. No escalation channel exists in the software yet.

## Not built (read before launch)
- Automated image or video screening of any kind; automated text screening beyond contact details, links and a short term list.
- Legal review of the policy, terms and privacy pages (they are labelled drafts); operator identity, governing law, children's use and age gate; a statutory takedown or counter-notice procedure.
- Email notifications (notices are in-app only); a notice of "you were reported" is deliberately not sent.
- Account-level suspension or banning, and appeals against takedowns.
- Data export, and a defined backup-retention policy.
- Rate limiting of signed-in write actions beyond the existing per-action hourly caps; login rate limiting and password reset (see the account-security workstream).
- Object-storage deletion semantics (the local-disk adapter is development-only).
