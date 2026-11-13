# premium-ui

A skill that makes product UI look premium: audit, hero recipes, tokens, an illustration kit, screenshot and audit scripts, and example components.

Install: copy this folder into a project's `.claude/skills/` (or upload `premium-ui.skill` to Claude). Then ask for it: "make this page look premium", "audit this UI", "redesign the hero like Pave".

Scripts need Playwright (`npm i -D playwright @axe-core/playwright`). Run `node scripts/shoot.mjs http://localhost:3000` and `node scripts/audit.mjs http://localhost:3000`.
