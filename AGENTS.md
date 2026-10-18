<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Fall monitor

- Fall detection is always on: `app/components/rehab/FallGuard.tsx` (mounted in `RehabApp`) feeds the shared `usePoseSource` stream into the rules in `lib/fall/detector.ts`. The camera opens at app start and the one `<video>` lives in `RehabApp`, so poses flow on every screen; don't add another video element or pose model. No trained fall model.
- `lib/fall/detector.ts` is pure logic with no runtime imports (the test loads it with Node type stripping), and no TS parameter properties or enums.
- Run `npm run test:fall` after changing `lib/fall/` or `FALL_CONFIG`.
- Alerts: `triggerAlert()` in `lib/alert/server.ts` (Twilio, server-only) via `POST /api/alert/fall` (sent once when the alarm goes off) and `POST /api/alert/test`. Never send alerts to emergency numbers; recipient comes only from `ALERT_TO_NUMBER`.

## Accounts and database

- Google sign-in is Auth.js v5 (`auth.ts`, JWT sessions, no adapter: `@auth/mongodb-adapter` doesn't support mongodb 7). API routes get the user from `resolveUserId()` in `lib/db/user.ts`: the session's `google:<sub>` wins; otherwise only an anonymous UUID from the body is accepted, so a client can't claim an account id.
- MongoDB access is server-only through `getDb()` in `lib/db/server.ts`. The app must keep working when the database is down: sync is fire-and-forget and history stays in localStorage.
- `lib/rehab/health.ts` (My Health body map scoring) is pure logic loaded by `npm run test:rehab`; keep runtime imports to `./settings` only.

## Health record plan

- The app starts on `EhrUploadScreen` until a plan exists. `POST /api/ehr/plan` (PDF in form field `file`) → `lib/ehr/server.ts` extracts text with `unpdf` and asks OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`, default `gpt-6.1-sol`) to pick routines; the JSON schema only allows IDs from `ROUTINE_ORDER`.
- Never store or log the record text. Only the plan (`lib/rehab/plan.ts`, localStorage) is kept.
- Home, "Start today's session" and Session complete use the plan's routines; Progress still shows all routines.
