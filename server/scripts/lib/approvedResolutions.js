/**
 * Approved manual-conflict-review decisions — Base44 → Inspire Daily migration.
 *
 * Every entry here traces back to an explicit decision the project owner made
 * in the manual conflict review round, not an inference by the importer.
 * This file exists so those decisions are reviewable as data (grep-able,
 * diffable, revertible) rather than buried as branching logic inside
 * migrationImport.js. Nothing here is applied unless migrationImport.js is
 * run with --commit.
 *
 * If a future export surfaces a NEW conflict not listed here, the importer
 * must treat it as HELD by default — this file is an allow-list of already-
 * reviewed cases, not a general conflict-resolution policy.
 */

// ─── Identity ────────────────────────────────────────────────────────────────
// Base44 "Bert Hernandez" == current "Roberto Hernandez": same email, same
// last name, same role (Alumni/alumni). Decision: SAME PERSON. His profile
// name must never be overwritten with the Base44 value.

export const IDENTITY_OVERRIDES = new Map([
  ['robertoh1106@gmail.com', {
    decision: 'same_person',
    reason: 'Matching email + last name ("Hernandez") + role (Alumni). "Bert" treated as a nickname for Roberto, not a different person.',
    neverOverwriteFields: ['first_name', 'last_name'],
  }],
]);

// ─── Daily Score (email, date) duplicate groups ─────────────────────────────
// decision: 'hold' | 'keep_newer' | 'keep_older'
// 'keep_newer'/'keep_older' pick by updated_date (tie-break created_date, id)
// within that specific group — see base44Csv.pickRecommendedWinner/pickOldest.

export const DAILY_SCORE_RESOLUTIONS = new Map([
  ['ma@inspiringchildren.org|2026-06-02', {
    decision: 'hold',
    reason: '3-way conflict; all three rows differ meaningfully; all three updated_date values land within <1s of each other — a batch script touch, not a real edit signal. Preserve all three for later review; do not block this user\'s other clean dates.',
  }],
  ['pa@inspiringchildren.org|2026-06-03', {
    decision: 'keep_newer',
    reason: 'Created a full day after the other row — looks like a genuine resubmission, not a batch artifact.',
  }],
  ['allison080508@gmail.com|2026-06-06', {
    decision: 'keep_older',
    reason: 'The newer row looks like a blank/placeholder re-submission (N/A everywhere, earned_way=false, ceo_mindset=0); the older row has real substantive content.',
  }],
  ['kyradelfin@gmail.com|2026-06-08', {
    decision: 'hold',
    reason: 'Modest but real score differences on both rows; no reliable signal to prefer one.',
  }],
  ['ladagamcadam@gmail.com|2026-06-08', {
    decision: 'hold',
    reason: 'Large divergence across nearly every field — looks like two distinct real days, possibly mis-dated. Do not guess.',
  }],
  ['austinsequeira6@gmail.com|2026-06-08', {
    decision: 'keep_newer',
    reason: 'Lowest-risk of the six — most fields identical, only minor wording/score differences.',
  }],
]);

// ─── SummerEntry (email, date) duplicate groups ─────────────────────────────
// Any duplicate group NOT listed in SUMMER_ENTRY_HOLDS is approved to merge/
// dedupe automatically: either the category facts are byte-identical, or the
// only disagreement is Base44's own untrusted `total_points` value (which is
// never imported — the canonical engine recomputes it), so there is no real
// conflict to resolve for import purposes.

export const SUMMER_ENTRY_HOLDS = new Set([
  'allison080508@gmail.com|2026-06-05',
  'nilloc.ram525@gmail.com|2026-06-11',
  'lalagram1110@gmail.com|2026-06-12',
  'allison080508@gmail.com|2026-06-16',
  'nilloc.ram525@gmail.com|2026-06-27',
  'nilloc.ram525@gmail.com|2026-07-03',
  'allison080508@gmail.com|2026-07-16',
  'vishwasiv2010@gmail.com|2026-08-07',
  'vishwasiv2010@gmail.com|2026-08-11',
]);

// ─── Orphan Goal reconstruction (goal_id) ───────────────────────────────────
// Approved to RECONSTRUCT a minimal historical parent goal (type=reading,
// proven by GoalBook presence). All other orphan goal_ids are approved for
// ARCHIVE, but archiving is currently BLOCKED — the live schema has no way to
// mark a goal "archived"/non-live, so inserting one today would render as a
// real active Goal card, which the approval explicitly forbids. See
// migrationImport.js's printed schema proposal; do not apply it without
// separate sign-off.

export const GOAL_ORPHAN_RECONSTRUCT = new Set([
  'dreambigayenxavia@gmail.com|6a223cd5d2b753f1f89d6519',
  'ma@inspiringchildren.org|69f265480961f72e98433870',
]);

// ─── Badge type overrides ────────────────────────────────────────────────────
// Base44's badge_type doesn't always land in the rebuilt schema's fixed enum
// (event/skills/staff/milestone) — badges_badge_type_check rejects anything
// else. A mismatch is held for a human to pick the correct category; this is
// the allow-list of already-decided mappings. Only badge_type is remapped —
// name/description/earned_date/trigger_key/source are always preserved
// verbatim from the Base44 row.

export const BADGE_TYPE_OVERRIDES = new Map([
  ['ma@inspiringchildren.org|Consistency', {
    badgeType: 'milestone',
    reason: "Base44 badge_type 'achievement' has no rebuilt counterpart; approved mapping to 'milestone'.",
  }],
]);

export function dailyScoreKey(email, date) {
  return `${email}|${date}`;
}
export function summerEntryKey(email, date) {
  return `${email}|${date}`;
}
export function goalOrphanKey(email, goalId) {
  return `${email}|${goalId}`;
}
export function badgeKey(email, name) {
  return `${email}|${name}`;
}
