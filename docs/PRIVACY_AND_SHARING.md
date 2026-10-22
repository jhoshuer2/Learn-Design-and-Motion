# Privacy and sharing (as built in M5)

## Principle
Nothing is visible to anyone until the learner explicitly shares it. Sharing is per project, reversible at any moment, and takes effect on the very next request.

## What each visibility exposes
| Setting | Who can open the page and images | Listed in community gallery (signed-in only) | On the owner's public portfolio page | Shows owner's public handle |
|---|---|---|---|---|
| Private (default) | Owner only | No | No | n/a |
| Anyone with the link | Anyone who has the link | No | No | No |
| Public | Anyone on the web | Yes | Yes | Yes |

The link is a random 96-bit token. "Anyone with the link" is only as private as the link itself, and the edit page says so. A moderator hold hides a project from everyone but its owner and forces it Private.

## What a shared page contains (allow-list)
Title, optional introduction, the images the owner chose, the owner's display name, the rationale (if the owner keeps it on), the assignment title, peer feedback that is not hidden, and, only if the owner opts in, the assessment result.
It never contains: email address, account name, user id, storage keys, file names, file hashes, change notes, appeal text, raw model output, reviewer notes, or any other learner's data. This is enforced by building the read model field by field (`src/lib/portfolio/view.ts`) and by a test that plants secrets and searches the serialised output.

## Images
Originals stay private and are never modified. Shared images are decoded and re-saved without metadata (EXIF location and camera data, XMP, text chunks) and with orientation applied, on every request. Every image request re-checks visibility and that the owner chose that image.

## Assessment evidence on a project (opt-in)
Off by default. When on, the page shows the score, per-criterion scores, who assessed it (AI model, human reviewer, or "TEST EVALUATOR: not a real assessment of the work"), the rubric and version, and the date, with a statement that it is a learning assessment and not a qualification. A "Verified" mark is shown only for a **passed** result from `claude` or a human reviewer (one function, `isVerified`). Skills are listed only with that evidence (criteria scored 80 or more).

## Display names
The only name other people see. Separate from the account name; 2 to 40 characters; refused if it looks like an email or web address. Required before sharing or reviewing. Handles are random and cannot be chosen.

## Peer feedback
Structured (what works, suggestions, optional question), plain text (rendered escaped, never as HTML or links), 20 to 1500 characters per box. Only on shared projects, never on your own, one per person, 10 per hour. It is stored in tables with no relation to progression or assessment, and tests check both the rows and the source. Owners can hide, restore or delete any review and block a reviewer (their existing reviews on that owner's projects are hidden). Reviewers can withdraw their own.

## Reports and moderation
Any signed-in user can report a visible project or review (once per target, 10 per hour). Reviewers and admins see a queue, can hide a review, put a project on hold (forced Private, cannot be re-shared until lifted) or dismiss. One moderator resolves each report, nobody moderates their own work, and every decision is audited.

## Search engines
All shared pages send `noindex`, `robots.txt` disallows them, and image responses send `X-Robots-Tag: noindex`. People can still copy what they see.

## What is NOT built (read before launch)
- **No automated screening of uploaded images or text.** Public image hosting of user content depends entirely on manual moderation and reports. This needs a decision (automated checks, pre-moderation, or restricting public to trusted accounts) before any real launch.
- No takedown or legal complaint process, no terms or content policy text, no age gate.
- No account or data deletion. Deleting a project removes the page and its feedback but not the submission or its assessment.
- No email notifications to owners (new feedback, reports, holds).
- No rate limiting on anonymous page or image reads.
- No custom handles, search or filters in the gallery, revision history or earlier attempts on a project, or completion records on portfolios.
- Local-disk image storage is development-only.
