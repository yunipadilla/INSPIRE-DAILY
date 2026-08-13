# Base44 → Inspire Daily Migration Readiness Report

**Status: no accounts have been imported. No production user data has been modified. This is a discovery + read-only tooling deliverable only.**

---

## 1. Base44 data sources discovered

Two things exist locally, and they are **not the same kind of artifact**:

- **`~/INSPIRE DAILY/` (and its duplicate `/Users/INSPIRE DAILY/INSPIRE DAILY/`)** — 8 screenshots of the legacy app's Daily Scores and Summer Challenge forms. UI reference only; no data.
- **`~/Downloads/inspiredaily.zip`** — the actual Base44 **application source export** (195 files: entity schemas, serverless functions, React pages/hooks, agents). This is code and schema definitions, confirmed genuine and current by direct inspection this session.

**Critical finding: neither artifact contains actual historical participant records.** There is no CSV/JSON dump of real Daily Scores submissions, real streak values, real badges, or real goal logs anywhere on this machine. What the export gives us is the *shape* of that data (exact field names, types, enums, and the business logic that read/wrote it) — not the data itself. Base44's own hosted database (wherever it still lives) is the only place the real historical rows exist right now.

**This changes the shape of "next step."** Steps 1–9 below are only possible with a genuine per-entity data export from Base44 (its own export/download feature, or an API pull) placed in a local directory. The tooling built this session (§7) is ready and tested for that; it has nothing to reconcile until that file drops in.

---

## 2. Current database structures involved

Read directly from the live Supabase Postgres instance this session (the same instance production and local dev both use):

| Table | Live row count | Notes |
|---|---|---|
| `users` | 4 | `users_email_key` is a case-**sensitive** UNIQUE constraint |
| `daily_scores` | 1 | |
| `goals` | 4 | |
| `goal_books` | 2 | |
| `goal_logs` | 5 | |
| `summer_entries` | 0 | this is the Inspire Challenge table |
| `badges` | 0 | `source` CHECK currently allows only `'manual'`/`'automatic'` |
| `task_signups` | 0 | |

The program is early enough (4 real accounts) that reconciliation tooling built now, before volume grows, is the right sequencing.

---

## 3. Fields that map cleanly

| Base44 entity | Inspire Daily table | Mapping |
|---|---|---|
| `User.streak_count`, `streak_last_date`, `streak_shields` | `users.streak_count/streak_last_date/streak_shields` | Same concepts, same names, values not directly portable (see §8) |
| `User.first_name`, `last_name`, `birthday`, `phone`, `app_role` (`Intern/Postgrad/Alumni/Staff`) | `users.*` | 1:1, only casing differs (`Intern` vs `intern`) |
| `DailyScore.date/challenges/earned_way/volunteer_hours/best_self/ceo_mindset/grit/happiness/sleep/goals_worked_on` | `daily_scores.*` | 1:1, identical field-for-field — confirmed against the legacy screenshots too |
| `Goal.type` enum (`reading/fitness_daily/fitness_weekly/learning/custom/meditation`) | `goals.type` | Identical enum, in both systems |
| `GoalBook.title/author/total_pages/current_page/completed/start_date/order_index` | `goal_books.*` | 1:1 |
| `GoalLog.date/log_type/note/value/book_id/activity/week_key` | `goal_logs.*` | 1:1 |
| `TaskSignup.task_title/status/hours_spent/notes/completed_date` | `task_signups.*` (joined via `task_id`→`internship_tasks`) | 1:1 |
| `Badge.badge_type` enum (`event/skills/staff/milestone`) | `badges.badge_type` | Identical enum |
| `Badge.name/description/icon_emoji/earned_date` | `badges.*` | 1:1 |

## Fields that do not map cleanly

- **`SummerEntry` (Inspire Challenge) point categories are a different system entirely.** Base44: `hydration`(check,10pt), `mindfulness`(check,10pt) *and a separate* `mindfulness_sessions`(count) — the entity itself has drifted (a boolean and a count field for the same concept, never reconciled). Also `exercise`(15), `healthy_meal`(10), `journaling`(10), `phone_time_under_2h`(10), `sleep_hours`(scaled,15), `volunteer_hours`(scaled,20). Rebuilt Inspire Challenge: `sleepBedBefore10`(1)+`sleep8h`(1), `hydration`(1), `exercise`(2), `screenTimeTier`(0-3), `mindfulnessSessions`(0-3), `readingSessions`(0-4), `dailyUpdateSent`(4), `nutrition`(1), `coldPlungeType`(0-1). **No category lines up point-for-point; several rebuilt categories (reading, screen-time tier, cold plunge, structured sleep) have no Base44 counterpart and vice versa (`healthy_meal`, `journaling`, `phone_time_under_2h` don't exist in the rebuild).** `total_points` must never be copied across systems — see §8.
- **Badge catalog mismatch.** Base44 awarded badges automatically for every 7-day streak multiple up to 70+ days (`Consistency`, `Two-Week Warrior`, …, `Elite`), plus `Dedicated Member` (30 cumulative submissions — not a streak), `Task Champion`, `Monthly Leader`, `Summer Challenge` completion, and free-form `event_*` badges. The rebuilt static catalog (`server/src/config/badgeCatalog.js`) has 12 entries and only one streak-milestone concept (`thirty-day-streak`). **Historical badge names/descriptions can and should be preserved verbatim on import — they do not need to exist in the rebuilt catalog, because the catalog only gates the live *manual award* HTTP endpoint, not a one-time historical import.** The real blocker is narrower (see §9).
- **`User.account_pin`, `pin_reset_token`, `known_device_id`** — the legacy PIN-based auth system. The rebuild has no PIN concept at all (standard email/password only, per your own instructions and prior engagement history — this was a deliberate, documented security fix: the legacy `lookupUserPin` function returned a plaintext PIN with no authentication check). **Do not import or reference these fields for anything.**
- **`Connection`, `DailyUpdate`** entities exist in Base44 (follow/following social graph; a separate daily-text-update feed) with matching-but-dead tables already sitting in the rebuilt schema (`connections`, `daily_updates`, both empty, zero code references). If Base44 has real historical rows here, they represent a feature that was never carried into the rebuild — flag for a product decision (import into the dead tables for record-keeping, or intentionally drop), not an engineering one.
- **`SignupRecord`** — a legacy debugging/audit entity for the PIN signup flow (`role_saved_correctly`, `pin_saved` as string flags). No rebuilt equivalent; not migratable, not needed.

---

## 4. Raw facts vs. derived values

| Raw historical fact (import if reliable) | Derived value (recalculate, don't copy) |
|---|---|
| Daily Scores submission dates + slider values | `streak_count` |
| Which 7-day intervals were actually reached (inferred from dates) | `streak_shields` (see §8 — only a partial reconstruction is even possible) |
| Goal/GoalBook/GoalLog rows (progress facts) | `goal.completed` (rerun `isGoalComplete()`) |
| SummerEntry boolean/numeric category values | `summer_entries.total_points` (rerun `calculateSummerPoints()` — and only for fields that map, see §3) |
| Badge name/type/description/earned_date/trigger_key | Nothing derived — a badge award is itself a fact, not computed from other facts |
| TaskSignup hours_spent/status/completed_date | Any weekly-hours aggregate (already computed live by `weeklyHoursForUser()`) |

---

## 5. Proposed identity-matching strategy

Primary key: **normalized email** (`trim().toLowerCase()`), matching the pattern the live `findByEmail()` already uses. Classification, applied per Base44 identity:

- **MATCHED** — exactly one Base44 `User` row and exactly one current `users` row share the normalized email, and the two full names are not materially different.
- **NOT_YET_SIGNED_UP** — no current `users` row has that email. No account is created; the reconciliation state is simply "pending" (§8/§9).
- **AMBIGUOUS** — more than one Base44 `User` row shares the normalized email (a genuine duplicate/conflicting identity inside Base44's own data — never auto-merged), **or**, in principle, more than one current row matches (checked explicitly even though the live `users_email_key` UNIQUE constraint should make this impossible today — see the case-sensitivity note in §11).
- **CONFLICT** — exactly one match on each side, but the full names differ materially. Flagged for a human, never resolved automatically.

This is implemented, not just proposed — see §7.

---

## 6. Proposed dry-run architecture

Built this session at [`server/scripts/migrationDryRun.js`](server/scripts/migrationDryRun.js). Read-only: every database call in the file is a `select` (verifiable by grepping the file for `query(`). It:

1. Loads a Base44 export directory (`User.json`, `DailyScore.json`, `SummerEntry.json`, `Goal.json`, `GoalBook.json`, `GoalLog.json`, `Badge.json`, `TaskSignup.json` — each optional, missing = empty).
2. Classifies every Base44 identity per §5.
3. For each MATCHED user, prints the exact preview format your instructions specified: raw counts on both sides, a proposed import count, a canonical streak recalculation (using the real `calculateStreak()` from `server/src/lib/streakEngine.js` — not a reimplementation), a shield estimate with its limitations explained, and a list of badges that would be newly imported.
4. Never writes to the database or to the export files.

**Tested this session** against a synthetic sample export (fictitious emails, e.g. `dryrun.migration.test@example.invalid`) and one disposable account created through the real signup flow, submitted a real Daily Scores entry, ran the tool, then fully deleted the account and its row. Verified the real `users` table count was 4 before and 4 after — no real account was touched. The test also incidentally verified a genuine edge case: a deliberately-inserted gap (a missing Monday) correctly broke the canonical streak calculation rather than being smoothed over.

**To run it for real:** export Base44's entities to that directory structure, then:
```bash
node server/scripts/migrationDryRun.js /path/to/export
node server/scripts/migrationDryRun.js /path/to/export --email=someone@example.org
```

---

## 7. (See §6 — architecture and dry-run tool are the same deliverable, covered above.)

---

## 8. Streak/shield reconciliation strategy

**Streak.** The rebuilt `calculateStreak()` (`server/src/lib/streakEngine.js`) implements the *same rule* Base44's own frontend `utils/streak.js` implemented: Sundays are always a rest day (never counted, never break a streak), and there's a same-day/before-noon grace window. This is not a coincidence — the rebuild's canonical engine is a deliberate continuation of that logic. So for a genuinely complete submission history, the canonical rebuilt recalculation should reproduce what Base44 *should* have displayed.

It will often **not** match what Base44 actually displayed, though, because the Base44 export contains **four separately-written streak implementations** (`midnightStreakReset`, `fixAllStreaks`, `fixSundayStreaks`, `streakAudit`, plus the frontend `utils/streak.js` — five, really) with small but real divergences in their Monday/Tuesday grace-period handling, confirmed by direct inspection this session. `fixSundayStreaks` even contains a hardcoded `RESTORE_MAP` of specific participant emails with manually-reconstructed streak values from a real June 8, 2026 repair incident — direct evidence the displayed number drifted from the true history at least once in production.

**Resolution rule (per your instructions, and applied in the tool):** never overwrite the canonical recalculation with Base44's displayed number. Import the underlying dates, recalculate canonically, and treat a mismatch as expected and explainable rather than a bug to "fix" by matching Base44. Only escalate to a human when the gap is large and the dates alone don't explain it.

**Shields — a genuine limitation, not a implementation gap.** A shield is *earned* the instant a streak first crosses a 7-day multiple (that's derivable by replaying submission dates chronologically, which the tool does). A shield is *consumed* on a missed required day — and that consumption event is **not recorded as a queryable historical fact in either schema**. Base44 doesn't log a "shield used" event; neither does the rebuild. That means:
- The tool can compute an accurate **upper bound** (milestones crossed, capped at 3) — implemented and labeled explicitly as an estimate.
- It cannot know how many of those were later spent.
- **Recommended resolution:** show both Base44's displayed value and the upper-bound estimate to staff during migration review; do not auto-set `streak_shields` from either. If the two roughly agree, trust the estimate as a reasonable starting point. If they diverge widely, leave shields at their natural post-import value (0, or whatever `applySubmission` produces the next time the user submits) and let normal use re-earn them — this matches your instruction not to fabricate a number just to match a legacy display.

**Controlled admin override:** not built. Per your instructions, only build one if genuinely necessary, and never client-invokable. Given the shield-consumption gap can't be resolved with more engineering (the fact is simply gone), an override would mainly need to exist for exactly the "recovery-window" mechanism `streakEngine.js` already has for *live* misses (`streakRecoveryAvailableUntil`/`streakRecoveryPriorCount`) — worth reusing that existing mechanism for a migrated user's initial post-import state rather than inventing a second one, if/when this becomes necessary. Not needed for this deliverable.

---

## 9. Badge migration strategy

Historical badge **names/descriptions/types/dates should be preserved verbatim** — they don't need to correspond to an entry in the current manual-award catalog, because that catalog only constrains the live HTTP award endpoint (`POST /api/hq/members/:id/badges`), not a one-time bulk import that would insert directly via the repository layer, bypassing that endpoint entirely.

**The one real blocker:** `badges.source` has a live CHECK constraint allowing only `'manual'` or `'automatic'` — confirmed by direct inspection this session (`badges_source_check`). Neither value is truthful for a historical import: `'manual'` would fabricate a staff member who never awarded it (violating your explicit instruction), and `'automatic'` would misrepresent it as the rebuild's own (currently nonexistent) auto-award logic.

**Proposed minimal migration — presented here for approval, not yet run:**
```sql
ALTER TABLE badges DROP CONSTRAINT badges_source_check;
ALTER TABLE badges ADD CONSTRAINT badges_source_check
  CHECK (source IN ('manual', 'automatic', 'legacy'));
```
Additive in effect (widens an allowed-values list, touches no existing rows — there are 0 rows in `badges` today anyway), consistent with every prior schema change in this project's history (write exact SQL, get approval, run once, verify via `information_schema` before writing code against it). `awarded_by` stays `NULL` and `reason` stays `NULL` for `source='legacy'` rows — no fabricated staff attribution, no fabricated reason, exactly as instructed.

Duplicate protection reuses the existing guard: `findByUserAndTypeAndName(userId, badgeType, name)` already used by the live award endpoint — a real migration script should call the same function before inserting, so a badge already present (e.g. a staff member re-awarded it manually before the migration ran) is skipped, not duplicated.

---

## 10. Schema changes genuinely required

**Exactly one**, and it's narrow:
```sql
ALTER TABLE badges DROP CONSTRAINT badges_source_check;
ALTER TABLE badges ADD CONSTRAINT badges_source_check
  CHECK (source IN ('manual', 'automatic', 'legacy'));
```
Nothing else. Every other historical fact (Daily Scores, goals, goal books/logs, task signups, Inspire Challenge raw category values) already has a compatible column in the live schema.

**Not required, but worth naming as a future hardening item, not part of this deliverable:** `users_email_key` is a case-*sensitive* UNIQUE constraint. Two accounts differing only by email casing (`Person@x.com` vs `person@x.com`) could theoretically both exist and would show as AMBIGUOUS in the dry-run tool rather than silently mis-matching — which is the safe failure mode, but a case-insensitive unique index would prevent the underlying accounts from existing in the first place. Not touching this now; flagging it because it surfaced directly from testing the matching logic.

---

## 11. Risks / conflicts discovered

- **No actual Base44 participant data exists locally** (§1) — the single biggest blocker to actually running a real migration. Nothing else in this report can move to execution without it.
- **Base44's own streak numbers are known-unreliable** (§8) — a real repair incident with a hardcoded restore map is direct evidence of this, not a hypothetical risk.
- **Inspire Challenge point formulas are incompatible between systems** (§3) — any temptation to "just copy `total_points` over" would produce numbers that don't mean what they appear to mean.
- **Legacy PIN system fields must never be imported or referenced** (§3) — this was a documented, deliberate security removal, and reconciliation tooling must not accidentally resurrect it (e.g. by importing `account_pin` if it ever appeared in an export).
- **Shield consumption history is unrecoverable** (§8) — a real limitation of the available facts, not a tooling gap; the recommendation is to be transparent about the estimate rather than presenting a false precision.
- **`users_email_key` is case-sensitive** (§10) — a latent, low-probability identity-matching risk, currently handled safely (falls to AMBIGUOUS) but worth hardening eventually.
- **The Base44 hosted instance's current reachability is unknown** — this session found no API credentials, connection strings, or live-fetch code pointing at a still-active Base44 backend anywhere in this project. If Base44 access has already lapsed, the *only* remaining source of truth is whatever export can still be pulled from Base44's own dashboard before that becomes impossible — worth prioritizing soon rather than later.

---

## 12. Exact next implementation step

**Export real Base44 data.** Nothing else in this pipeline can proceed without it. Concretely:
1. From Base44's dashboard, export each entity relevant to this migration — `User`, `DailyScore`, `SummerEntry`, `Goal`, `GoalBook`, `GoalLog`, `Badge`, `TaskSignup` — to the JSON-array-per-entity layout `server/scripts/migrationDryRun.js` already expects (documented in the file's own header comment). If Base44 only offers CSV, convert to JSON first — the tool deliberately doesn't guess at CSV typing.
2. Run `node server/scripts/migrationDryRun.js /path/to/export` locally. It is read-only; running it costs nothing and touches nothing.
3. Review the MATCHED/NOT_YET_SIGNED_UP/AMBIGUOUS/CONFLICT breakdown and the per-user proposed-import previews with staff.
4. Only then: present the one approved schema change (§9/§10) for sign-off, and design the actual import-writing script (reusing the same identity-matching and duplicate-guard logic already proven in the dry-run tool) as a separate, explicitly-approved next step — still not part of this deliverable.
5. Longer-term (§8 of your instructions): the Inspire HQ "Historical Data / Migration" section on Member Profile (Preview / Approve / Recalculate / Verify actions, admin/super_admin only) is the right eventual home for this — building the read-only dry-run tool first, before that UI, was the right sequencing, since the UI would just be a thin wrapper over the same logic once it needs to handle real data.

---

## Ongoing development rule (reconfirmed)

Inspect → Modify locally → Test → Commit → Review → Push → Render deploy → Production smoke test → Clean disposable test data — reconfirmed against the live `CLAUDE.md` this session, unchanged. This deliverable followed it exactly: inspected both data models fresh (no reliance on prior-session memory), built the tool, tested it against a disposable account (created via the real signup flow, then fully deleted — verified real user count unchanged), and committed locally (`4e9fe80`). **Not pushed, not deployed**, per your instruction to stop here.
