# Inspire Daily — Development Guide

A full-stack app for the Inspiring Children Foundation: a React/Vite client (`client/`) and an Express/Postgres server (`server/`), deployed as a single Render web service, backed by one Supabase Postgres instance used for both local development and production (there is no separate dev database).

## Structure

**`server/src/`**
- `routes/` — Express route handlers. Shape HTTP requests/responses; no direct SQL here.
- `services/` — cross-cutting logic that composes multiple repositories (e.g. `services/hq/*` builds HQ's dashboard/member views out of several tables at once).
- `repositories/` — the only layer that runs SQL. One file per table/feature area (`dailyScores.js`, `goals.js`, `badges.js`, etc.).
- `lib/` — shared, stateless utilities (streak math, JWT, password hashing, validators).
- `agents/` — scheduled background jobs (cron-driven reconciliation, not literal AI agents).
- `config/` — constants, environment loading, Pacific-time helpers, the badge catalog.
- `middleware/` — `auth.js` (session + role checks), `rateLimit.js`.

Convention: `routes → services (optional) → repositories`. A route should never contain raw SQL; a repository should never know about `req`/`res`.

**`client/src/`**
- `pages/app/` — participant-facing pages; `pages/hq/` — staff-facing Inspire HQ pages.
- `components/ui/` — the shared design-system component library (Button, Card, Medal, ProgressRing, DataTable, etc.).
- `components/hq/`, `components/goals/`, `components/tasks/`, `components/auth/` — feature-scoped components.
- `context/` — `AuthContext`, `ThemeContext`.
- `lib/` — API client, Pacific-time helpers mirrored from the server.

## Theming — never hardcode a color

Every color in the app is a CSS custom property defined in `client/src/index.css` (`:root` for light, `:root.dark` for dark), exposed to Tailwind via `tailwind.config.cjs`'s `token()` helper. Use the existing semantic classes (`text-navy`, `bg-surface-soft`, `text-danger`, `text-link`, etc.) or add a new token — never a literal hex value or a raw Tailwind color like `text-red-500` in a component. This is what makes dark mode "just work" for new UI with zero extra effort. Two narrow, deliberate exceptions exist and are documented inline where they occur: brand assets that must look identical in both themes (the INSPIRE wordmark gradient, the medal metal-tone gradients), and values a browser API requires as a literal (the `<meta name="theme-color">` tag).

## Schema changes — no migration tooling exists

There is no migration framework in this repo (no Knex/Prisma/node-pg-migrate, no `.sql` files under version control). Schema changes are applied by hand, directly against the live Supabase instance, using a short Node script through `server/src/db.js`. Because this is the same database production reads from, treat every schema change as a production change:
1. Write the exact SQL first and get it reviewed/approved before running it (this is what happened for the `badges.awarded_by/reason/source` columns added for Staff Badge Management — see git history).
2. Run it once, then verify column/constraint existence with a read-only `information_schema.columns` query before writing any application code against it.
3. Prefer additive, nullable columns with sensible defaults over anything that could lock or rewrite existing rows.

If this project grows enough to need real migration tooling, that's a deliberate decision for a future sprint, not something to introduce quietly alongside an unrelated change.

## Testing

There is currently no automated test suite (no Jest/Vitest/Mocha, no `*.test.js` files, no `npm test` script in either `package.json`). Verification today is manual: build + lint checks, then exercising the actual app (locally or against production) with a disposable test account. This is a known gap, not a design choice — worth addressing deliberately in a future sprint rather than bolted on as a side effect of an unrelated change.

## The standard workflow

**Inspect → Modify → Test → Commit → Review → Push → Deploy → Production Verification**

1. **Inspect** — read the actual current file content before editing (not memory from an earlier session); grep for existing patterns/utilities to reuse before writing new code.
2. **Modify** — make the change.
3. **Test**:
   - Client: `cd client && npm run build` must complete with no errors.
   - Server: `node --check <file>` on every touched file (no test runner exists yet — see above).
   - Manually exercise the change: start the local server (`cd server && npm start`) and client dev server (`cd client && npm run dev`, proxies `/api` to `localhost:4000` per `vite.config.js`), or point a browser at the deployed URL.
   - Never test against a real user's account. Create a disposable account through the real signup flow, exercise the change, then delete every row it created (including cascading rows in other tables) before finishing. For staff-only surfaces, temporarily elevate the disposable account's `system_role`, verify, then either delete the account or set it back — never leave a stray staff-elevated test account behind.
4. **Commit** — stage exactly the intended files (never `git add -A` blindly); write a commit message that explains *why*, not just *what*.
5. **Review** — re-read the diff before pushing; for anything schema/production-data-adjacent, this is also where a human sign-off belongs.
6. **Push** — `git push origin main`. Only when explicitly asked to — do not push proactively.
7. **Deploy** — Render auto-deploys on push to `main` (`render.yaml` has no `autoDeploy: false`). Poll `curl https://inspire-daily.onrender.com/api/health` and check the served JS bundle hash (`curl .../ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'`) until it changes, confirming the new build actually landed.
8. **Production verification** — re-run the same manual checks from step 3 against the live URL, again with a disposable account, again cleaning up afterward. Check `read_console_messages`-equivalent (browser console) for errors and confirm role-gated routes (e.g. `/hq`) still behave correctly for both a participant and a staff account.
