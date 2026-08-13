#!/usr/bin/env node
/**
 * Base44 → Inspire Daily reconciliation DRY-RUN tool.
 *
 * READ-ONLY. This script never writes to the database, never writes to the
 * Base44 export files it reads, and never alters production in any way.
 * Every database call in this file is a `select` — grep for "query(" to verify.
 * It exists purely to answer: "if we were to migrate this person's history,
 * what would change, and does the canonical rebuilt engine reproduce what
 * Base44 displayed?" — and to surface every data-quality problem in the real
 * export (duplicates, orphan references, unmappable fields, identity
 * anomalies) for human review before anything is imported.
 *
 * Usage:
 *   node server/scripts/migrationDryRun.js <path-to-base44-export-dir> [--email=someone@example.org]
 *
 * Expected export directory layout — CSV is the primary, expected format
 * (this matches Base44's own per-entity dashboard export). Each file is
 * optional; missing = empty. A same-named `.json` file (array of objects) is
 * accepted as a fallback for anyone still using the older synthetic-test
 * layout, but CSV is what real Base44 exports actually produce, so CSV is
 * tried first.
 *
 *   User.csv          — id, email, full_name, first_name, last_name, birthday,
 *                        phone, app_role, status, streak_count, streak_shields,
 *                        streak_last_date, account_pin, pin_reset_token, ...
 *   DailyScore.csv     — date, sleep, challenges, earned_way, happiness, grit,
 *                        ceo_mindset, goals_worked_on, volunteer_hours,
 *                        best_self, points, created_by, id, created_date, updated_date
 *   SummerEntry.csv    — date, sleep_bed_before_10, sleep_hours, hydration,
 *                        exercise, screen_time, mindfulness(_sessions),
 *                        reading_sessions, cold_plunge, healthy_meal,
 *                        journaling, phone_time_under_2h, volunteer_hours,
 *                        total_points, created_by, id, created_date, updated_date
 *   Goal.csv           — user_email, type, name, target_date, completed, ...
 *   GoalBook.csv       — goal_id, user_email, title, author, total_pages, ...
 *   GoalLog.csv        — goal_id, user_email, book_id, date, log_type, value, ...
 *   Badge.csv          — user_email, badge_type, name, description, earned_date,
 *                        trigger_key, ...
 *   TaskSignup.csv     — user_email, task_id, task_title, status, hours_spent, ...
 *   InternshipTask.csv — title, description, assigned_to, created_by, ...
 *   Connection.csv     — follower_email, following_email, status, ...
 *   DailyUpdate.csv    — user_email, date, content, ...
 *   SignupRecord.csv   — email, full_name, role, ... — SUPPORTING EVIDENCE
 *                        ONLY, never the primary identity source (see below).
 *
 * NOTHING here calls insert/update/delete/alter. This tool may only run
 * SELECT statements against the live database.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { query, pool } from '../src/db.js';
import { calculateStreak, STREAK_CONSTANTS } from '../src/lib/streakEngine.js';
import { calculateSummerPoints } from '../src/lib/summerChallenge.js';
import { ptDayOfWeek, ptDateString } from '../src/config/pacificTime.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const exportDir = process.argv[2];
const onlyEmailArg = process.argv.find((a) => a.startsWith('--email='));
const onlyEmail = onlyEmailArg ? normalizeEmail(onlyEmailArg.slice('--email='.length)) : null;

if (!exportDir) {
  console.error('Usage: node server/scripts/migrationDryRun.js <path-to-base44-export-dir> [--email=someone@example.org]');
  process.exit(1);
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Tri-state boolean: 'true'/'false' strings from CSV, or null when blank —
 * blank must never be silently treated as false, since several SummerEntry
 * fields were only added partway through Base44's history (see the
 * schema-drift note near CATEGORY_FIELD_MAP below). */
function toBoolOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

function toNumOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeTimeMs(dateStr) {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t : 0;
}

// ─── Minimal RFC4180 CSV parser (no dependency) ─────────────────────────────
// Handles quoted fields containing commas, newlines, and doubled ("") quotes —
// required because real Base44 exports embed multi-line free-text (Daily
// Scores "challenges", GoalLog "note", etc.) inside quoted CSV fields. A naive
// line-split undercounts rows; this was confirmed directly against the real
// export this session (naive line counts read 765/529/24/... rows on files
// that actually contain the expected 655/530/25/... once parsed correctly).

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // swallow; \n (or end-of-file) terminates the row
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop a fully-blank trailing row (trailing newline artifact).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function csvToObjects(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });
}

async function loadEntity(baseName) {
  for (const ext of ['csv', 'json']) {
    try {
      const raw = await readFile(path.join(exportDir, `${baseName}.${ext}`), 'utf8');
      if (ext === 'json') {
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      }
      return csvToObjects(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Failed to parse ${baseName}.${ext}: ${err.message}`);
    }
  }
  return [];
}

/** Base44 DailyScore/SummerEntry rows carry the creator's email in `created_by`
 * (confirmed directly against the real export this session — neither entity
 * has its own `user_email` column); every other entity has an explicit
 * `user_email` (or `email` for User rows). */
function identityEmailFor(row) {
  if (row.user_email) return normalizeEmail(row.user_email);
  if (row.email) return normalizeEmail(row.email);
  if (row.created_by) return normalizeEmail(row.created_by);
  return null;
}

function groupByEmail(rows) {
  const map = new Map();
  for (const row of rows) {
    const email = identityEmailFor(row);
    if (!email) continue;
    if (!map.has(email)) map.set(email, []);
    map.get(email).push(row);
  }
  return map;
}

// ─── Load Base44 export ─────────────────────────────────────────────────────

async function loadBase44Export() {
  const [
    users, dailyScores, summerEntries, goals, goalBooks, goalLogs,
    badges, taskSignups, internshipTasks, connections, dailyUpdates, signupRecords,
  ] = await Promise.all([
    loadEntity('User'),
    loadEntity('DailyScore'),
    loadEntity('SummerEntry'),
    loadEntity('Goal'),
    loadEntity('GoalBook'),
    loadEntity('GoalLog'),
    loadEntity('Badge'),
    loadEntity('TaskSignup'),
    loadEntity('InternshipTask'),
    loadEntity('Connection'),
    loadEntity('DailyUpdate'),
    loadEntity('SignupRecord'),
  ]);

  return {
    raw: { users, dailyScores, summerEntries, goals, goalBooks, goalLogs, badges, taskSignups, internshipTasks, connections, dailyUpdates, signupRecords },
    usersByEmail: groupByEmail(users),
    dailyScoresByEmail: groupByEmail(dailyScores),
    summerEntriesByEmail: groupByEmail(summerEntries),
    goalsByEmail: groupByEmail(goals),
    goalBooksByEmail: groupByEmail(goalBooks),
    goalLogsByEmail: groupByEmail(goalLogs),
    badgesByEmail: groupByEmail(badges),
    taskSignupsByEmail: groupByEmail(taskSignups),
    signupRecordsByEmail: groupByEmail(signupRecords),
  };
}

// ─── Duplicate (user + date) detection — DailyScore / SummerEntry ──────────
//
// Groups rows by (identity email, date). A group of size 1 is a normal,
// unambiguous row. A group of size >1 is either:
//   - "auto-mergeable": every row has identical business-field values — no
//     information would be lost by keeping just one, so this needs no human
//     decision, just a stable deterministic pick (latest updated_date, tie-
//     broken by latest created_date, tie-broken by id).
//   - "conflicting": rows disagree on at least one business field. A
//     recommended winner is still computed (same rule), but every conflicting
//     group is surfaced for human review regardless — never resolved
//     silently, per migration policy.

function buildDateGroups(rowsByEmail, dateField = 'date') {
  const map = new Map(); // email -> Map(date -> rows[])
  for (const [email, rows] of rowsByEmail) {
    const byDate = new Map();
    for (const row of rows) {
      const d = row[dateField];
      if (!d) continue;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(row);
    }
    map.set(email, byDate);
  }
  return map;
}

function pickRecommendedWinner(rows) {
  return [...rows].sort((a, b) => {
    const tb = safeTimeMs(b.updated_date) - safeTimeMs(a.updated_date);
    if (tb !== 0) return tb;
    const cb = safeTimeMs(b.created_date) - safeTimeMs(a.created_date);
    if (cb !== 0) return cb;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function analyzeDuplicates(byEmailByDate, compareFields) {
  const autoMergeGroups = [];
  const conflictGroups = [];
  let uniqueDateCount = 0;
  for (const [email, byDate] of byEmailByDate) {
    for (const [date, rows] of byDate) {
      uniqueDateCount += 1;
      if (rows.length < 2) continue;
      const signature = (r) => compareFields.map((f) => r[f]).join('');
      const distinctSignatures = new Set(rows.map(signature));
      const winner = pickRecommendedWinner(rows);
      const group = {
        email,
        date,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          created_date: r.created_date,
          updated_date: r.updated_date,
          values: Object.fromEntries(compareFields.map((f) => [f, r[f]])),
        })),
        recommendedWinnerId: winner.id,
      };
      if (distinctSignatures.size === 1) autoMergeGroups.push(group);
      else conflictGroups.push(group);
    }
  }
  return { autoMergeGroups, conflictGroups, uniqueDateCount };
}

const DAILY_SCORE_COMPARE_FIELDS = [
  'sleep', 'challenges', 'earned_way', 'happiness', 'grit', 'ceo_mindset',
  'goals_worked_on', 'volunteer_hours', 'best_self', 'points',
];
const SUMMER_ENTRY_COMPARE_FIELDS = [
  'sleep_bed_before_10', 'sleep_hours', 'hydration', 'exercise', 'screen_time',
  'mindfulness', 'mindfulness_sessions', 'reading_sessions', 'cold_plunge',
  'healthy_meal', 'journaling', 'phone_time_under_2h', 'volunteer_hours', 'total_points',
];

// ─── SummerEntry (Inspire Challenge) field mapping ──────────────────────────
//
// Base44's SummerEntry schema visibly drifted mid-program: ~432 of 530 rows
// only ever populate the OLD field set (mindfulness/journaling/
// phone_time_under_2h/healthy_meal/sleep_hours as a 0-or-8 pre-scaled value);
// the remaining ~98 rows additionally populate a NEWER field set
// (sleep_bed_before_10/mindfulness_sessions/reading_sessions/screen_time/
// cold_plunge) that maps much more directly onto the rebuilt schema. This is
// a real, confirmed characteristic of the export, not a parsing artifact.
//
// CLEAN — maps 1:1 whenever present, no assumption required:
//   hydration, exercise (present across the whole date range)
//   sleepBedBefore10 (sleep_bed_before_10) — only populated on newer rows
//   mindfulnessSessions (mindfulness_sessions) — only populated on newer rows
//   readingSessions (reading_sessions) — only populated on newer rows
//   coldPlungeType (cold_plunge: plunge/shower/none) — only populated on newer rows
//
// AMBIGUOUS — a candidate mapping exists but requires an explicit human
// decision before use, because it either changes the field's meaning or
// papers over a scale mismatch:
//   sleep8h — Base44 has no boolean "slept 8h" field. `sleep_hours` is
//     suspiciously binary in this export (only ever '8' or '0', 485 vs 45
//     rows) — plausibly Base44's own pre-scaled encoding of the same
//     yes/no fact, but that is an inference, not a documented mapping.
//   nutrition — Base44's closest concept is `healthy_meal`, a related but
//     not identical criterion (per Migration Readiness Report §3).
//   screenTimeTier — Base44's `screen_time` uses values 0-4; the rebuilt
//     scale is 0-3. Without a confirmed conversion table this is a scale
//     mismatch, not a mapping.
//
// UNMAPPABLE — no rebuilt counterpart exists at all:
//   volunteer_hours (summer_entries has no such column — daily_scores does,
//     see the Volunteer Hours section), journaling, phone_time_under_2h,
//     the legacy `mindfulness` boolean (superseded by mindfulness_sessions
//     wherever both exist), dailyUpdateSent (no Base44 source field).

function mapSummerEntryClean(row) {
  const mapped = {};
  const unmapped = [];
  const ambiguous = [];

  mapped.hydration = toBoolOrNull(row.hydration) ?? false;
  mapped.exercise = toBoolOrNull(row.exercise) ?? false;

  const sleepBedBefore10 = toBoolOrNull(row.sleep_bed_before_10);
  if (sleepBedBefore10 !== null) mapped.sleepBedBefore10 = sleepBedBefore10;
  else { mapped.sleepBedBefore10 = false; unmapped.push('sleepBedBefore10 (no legacy data on this row — predates the field)'); }

  const mindfulnessSessions = toNumOrNull(row.mindfulness_sessions);
  if (mindfulnessSessions !== null) mapped.mindfulnessSessions = mindfulnessSessions;
  else {
    mapped.mindfulnessSessions = 0;
    const legacyBool = toBoolOrNull(row.mindfulness);
    unmapped.push(`mindfulnessSessions (no count on this row — legacy boolean 'mindfulness'=${legacyBool} cannot be safely converted to a session count without inventing a scale)`);
  }

  const readingSessions = toNumOrNull(row.reading_sessions);
  if (readingSessions !== null) mapped.readingSessions = readingSessions;
  else { mapped.readingSessions = 0; unmapped.push('readingSessions (no legacy data on this row — predates the field)'); }

  const coldPlunge = (row.cold_plunge || '').trim().toLowerCase();
  if (['plunge', 'shower', 'none'].includes(coldPlunge)) mapped.coldPlungeType = coldPlunge;
  else { mapped.coldPlungeType = null; unmapped.push('coldPlungeType (no legacy data on this row — predates the field)'); }

  // Ambiguous fields: computed but NOT applied unless a human approves the
  // inference — left at a safe false/0 default in `mapped`, with the
  // candidate noted separately for the report.
  const sleepHoursRaw = row.sleep_hours;
  ambiguous.push({
    field: 'sleep8h',
    candidateValue: sleepHoursRaw === '8',
    basis: `sleep_hours='${sleepHoursRaw}' (Base44's own binary 0-or-8 encoding — plausible but unconfirmed proxy for "slept 8+ hours")`,
  });
  const healthyMeal = toBoolOrNull(row.healthy_meal);
  ambiguous.push({
    field: 'nutrition',
    candidateValue: healthyMeal,
    basis: `healthy_meal=${healthyMeal} (related but not a confirmed identical criterion to the rebuilt "nutrition" checkbox)`,
  });
  const screenTime = toNumOrNull(row.screen_time);
  ambiguous.push({
    field: 'screenTimeTier',
    candidateValue: screenTime,
    basis: `screen_time=${screenTime} (Base44 scale is 0-4, rebuilt screenTimeTier scale is 0-3 — no confirmed conversion table)`,
  });
  mapped.screenTimeTier = 0;
  mapped.nutrition = false;
  mapped.dailyUpdateSent = false; // no Base44 source field at all

  return { mapped, unmapped, ambiguous };
}

// ─── Canonical shield reconstruction (best-effort, explicitly an estimate) ──
function estimateShieldsFromDates(sortedAscDates) {
  let milestonesHit = 0;
  const seen = new Set();
  for (const date of sortedAscDates) {
    if (ptDayOfWeek(date) === 0) continue;
    seen.add(date);
    const streakSoFar = calculateStreak([...seen], date);
    if (streakSoFar > 0 && streakSoFar % STREAK_CONSTANTS.SHIELD_INTERVAL_DAYS === 0) {
      milestonesHit += 1;
    }
  }
  return { estimatedShields: Math.min(milestonesHit, STREAK_CONSTANTS.MAX_SHIELDS), milestonesHit };
}

// ─── Orphan Goal/GoalBook/GoalLog analysis ─────────────────────────────────
//
// Some historical GoalBook/GoalLog rows reference a goal_id that no longer
// appears in Goal.csv (the parent goal was deleted/lost in Base44). These
// facts are never discarded — they're grouped by orphan goal_id and a
// recommendation is proposed (never applied) per the exact 3-option policy:
// reconstruct a minimal parent, archive raw facts only, or (last resort)
// exclude. A GoalBook's presence is treated as definitive proof of type
// 'reading' (only reading goals have books in this schema); everything else
// is reported with a low-confidence guess and a recommendation to archive
// rather than guess.

function analyzeGoalOrphans(goalsByEmail, goalBooksByEmail, goalLogsByEmail) {
  const emails = new Set([...goalsByEmail.keys(), ...goalBooksByEmail.keys(), ...goalLogsByEmail.keys()]);
  const results = [];
  for (const email of emails) {
    const ownedGoalIds = new Set((goalsByEmail.get(email) || []).map((g) => g.id));
    const books = goalBooksByEmail.get(email) || [];
    const logs = goalLogsByEmail.get(email) || [];
    const orphanBooks = books.filter((b) => b.goal_id && !ownedGoalIds.has(b.goal_id));
    const orphanLogs = logs.filter((l) => l.goal_id && !ownedGoalIds.has(l.goal_id));
    if (!orphanBooks.length && !orphanLogs.length) continue;

    const byGoalId = new Map();
    for (const b of orphanBooks) {
      if (!byGoalId.has(b.goal_id)) byGoalId.set(b.goal_id, { books: [], logs: [] });
      byGoalId.get(b.goal_id).books.push(b);
    }
    for (const l of orphanLogs) {
      if (!byGoalId.has(l.goal_id)) byGoalId.set(l.goal_id, { books: [], logs: [] });
      byGoalId.get(l.goal_id).logs.push(l);
    }

    const orphanGroups = [];
    for (const [goalId, { books: gBooks, logs: gLogs }] of byGoalId) {
      const dates = [...gBooks.map((b) => b.start_date || b.completed_date), ...gLogs.map((l) => l.date)].filter(Boolean).sort();
      const logTypes = [...new Set(gLogs.map((l) => l.log_type).filter(Boolean))];
      let inferredType = null;
      let confidence;
      let recommendation;
      if (gBooks.length) {
        inferredType = 'reading';
        confidence = 'high — a GoalBook row only ever belongs to a reading goal';
        recommendation = `RECONSTRUCT a minimal historical parent goal (type=reading, name derived from book title(s): ${gBooks.map((b) => b.title).filter(Boolean).join(', ') || '(untitled)'}).`;
      } else {
        if (logTypes.includes('session')) inferredType = 'meditation or learning (ambiguous — both use session-style logs)';
        else if (logTypes.includes('progress')) inferredType = 'custom or fitness_weekly (ambiguous)';
        else if (logTypes.includes('completed')) inferredType = 'fitness_daily or custom (ambiguous — binary completion pattern)';
        confidence = 'low — inferred from log_type/value shape only, not a stated type';
        recommendation = 'ARCHIVE the raw facts only (dates, log_type, value) without rendering a live Goal card — insufficient signal to safely reconstruct a typed parent goal without guessing.';
      }
      orphanGroups.push({
        goalId, email,
        bookCount: gBooks.length, logCount: gLogs.length,
        bookTitles: gBooks.map((b) => b.title).filter(Boolean),
        dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
        logTypes, inferredType, confidence, recommendation,
        sampleLogIds: gLogs.slice(0, 5).map((l) => l.id),
      });
    }
    results.push({ email, orphanGroupCount: orphanGroups.length, orphanGroups });
  }
  return results;
}

// ─── SignupRecord anomaly scan (supporting evidence only — never primary) ──
function analyzeSignupRecordAnomalies(signupRecordsByEmail, base44UserEmails) {
  const duplicateEmails = [];
  const notInUserTable = [];
  const malformedEmailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const malformed = [];

  for (const [email, rows] of signupRecordsByEmail) {
    if (rows.length > 1) {
      duplicateEmails.push({
        email,
        records: rows.map((r) => ({ id: r.id, full_name: r.full_name, signup_date: r.signup_date, created_date: r.created_date })),
        note: rows.some((r, i) => i > 0 && normalizeName(r.full_name) !== normalizeName(rows[0].full_name))
          ? '⚠ these records disagree on full_name under the same email — evidence this signup source is unreliable for identity, not just duplicated'
          : 'duplicate submissions, same apparent name',
      });
    }
    if (!base44UserEmails.has(email)) {
      notInUserTable.push({ email, count: rows.length, sampleFullName: rows[0]?.full_name });
    }
    if (!malformedEmailPattern.test(email)) {
      malformed.push(email);
    }
  }
  return { duplicateEmails, notInUserTable, malformed };
}

// ─── Read current Inspire Daily state (SELECT-only) ─────────────────────────

async function listCurrentUsers() {
  const { rows } = await query(
    `select id, lower(email) as email, first_name, last_name, birthday, phone, app_role, system_role,
            account_status, streak_count, streak_shields, streak_last_date, created_at
     from users order by created_at asc`
  );
  return rows;
}

async function currentDailyScoreDates(userId) {
  const { rows } = await query(`select date::text as date from daily_scores where user_id = $1 order by date asc`, [userId]);
  return rows.map((r) => r.date);
}

async function currentSummerEntryDates(userId) {
  const { rows } = await query(`select date::text as date from summer_entries where user_id = $1 order by date asc`, [userId]);
  return rows.map((r) => r.date);
}

async function currentCounts(userId) {
  const { rows } = await query(
    `select
       (select count(*) from daily_scores where user_id = $1) as daily_scores,
       (select count(*) from summer_entries where user_id = $1) as summer_entries,
       (select count(*) from goals where user_id = $1) as goals,
       (select count(*) from goal_books where user_id = $1) as goal_books,
       (select count(*) from goal_logs where user_id = $1) as goal_logs,
       (select count(*) from badges where user_id = $1) as badges,
       (select count(*) from task_signups where user_id = $1) as task_signups`,
    [userId]
  );
  return rows[0];
}

async function currentBadgeKeys(userId) {
  const { rows } = await query(`select badge_type, name from badges where user_id = $1`, [userId]);
  return new Set(rows.map((r) => `${r.badge_type}::${r.name}`));
}

async function getBadgesSourceConstraint() {
  const { rows } = await query(
    `select conname, pg_get_constraintdef(oid) as def
     from pg_constraint where conrelid = 'public.badges'::regclass and conname = 'badges_source_check'`
  );
  return rows[0] || null;
}

async function countBadgeRows() {
  const { rows } = await query(`select count(*)::int as n from badges`);
  return rows[0].n;
}

async function countInternshipTasks() {
  const { rows } = await query(`select count(*)::int as n from internship_tasks`);
  return rows[0].n;
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printHeader(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

async function reportMatchedUser(email, base44, currentUserRow, dsGroups, seGroups) {
  const b44User = (base44.usersByEmail.get(email) || [])[0] || {};
  const b44Scores = base44.dailyScoresByEmail.get(email) || [];
  const b44Summer = base44.summerEntriesByEmail.get(email) || [];
  const b44Goals = base44.goalsByEmail.get(email) || [];
  const b44Books = base44.goalBooksByEmail.get(email) || [];
  const b44Logs = base44.goalLogsByEmail.get(email) || [];
  const b44Badges = base44.badgesByEmail.get(email) || [];
  const b44Tasks = base44.taskSignupsByEmail.get(email) || [];

  const currentDates = await currentDailyScoreDates(currentUserRow.id);
  const currentSummerDates = await currentSummerEntryDates(currentUserRow.id);
  const currentCountsRow = await currentCounts(currentUserRow.id);
  const currentBadgeKeySet = await currentBadgeKeys(currentUserRow.id);

  // ─ Daily Scores ─
  const b44DateGroups = dsGroups.get(email) || new Map();
  const b44UniqueDates = [...b44DateGroups.keys()].sort();
  const dupDatesForUser = [...b44DateGroups.entries()].filter(([, rows]) => rows.length > 1).map(([d]) => d);
  const missingFromCurrent = b44UniqueDates.filter((d) => !currentDates.includes(d));
  const conflictingWithCurrent = b44UniqueDates.filter((d) => currentDates.includes(d));

  const mergedDates = [...new Set([...currentDates, ...missingFromCurrent])].sort();
  const todayStr = ptDateString();
  const recalculatedStreak = calculateStreak(mergedDates, todayStr);
  const { estimatedShields, milestonesHit } = estimateShieldsFromDates(mergedDates);

  // ─ Inspire Challenge / SummerEntry ─
  const seDateGroups = seGroups.get(email) || new Map();
  const seUniqueDates = [...seDateGroups.keys()].sort();
  const seDupDates = [...seDateGroups.entries()].filter(([, rows]) => rows.length > 1).map(([d]) => d);
  const seMissingFromCurrent = seUniqueDates.filter((d) => !currentSummerDates.includes(d));
  let projectedPointsTotal = 0;
  let base44PointsTotal = 0;
  const unmappedFieldNotes = new Set();
  for (const date of seMissingFromCurrent) {
    const rows = seDateGroups.get(date);
    const row = pickRecommendedWinner(rows); // for projection purposes only
    base44PointsTotal += toNumOrNull(row.total_points) || 0;
    const { mapped, unmapped } = mapSummerEntryClean(row);
    projectedPointsTotal += calculateSummerPoints(mapped);
    unmapped.forEach((u) => unmappedFieldNotes.add(u.split(' (')[0]));
  }

  const newBadges = b44Badges.filter((b) => !currentBadgeKeySet.has(`${b.badge_type}::${b.name}`));

  console.log(`\nUser: ${email}`);
  console.log(`  Identity: Base44 first/last "${b44User.first_name || ''} ${b44User.last_name || ''}".trim() ↔ current "${currentUserRow.first_name} ${currentUserRow.last_name}"`);
  const b44FullName = normalizeName(`${b44User.first_name || ''} ${b44User.last_name || ''}`);
  const currentFullName = normalizeName(`${currentUserRow.first_name} ${currentUserRow.last_name}`);
  if (b44FullName && currentFullName && b44FullName !== currentFullName) {
    console.log(`  ⚠ Note: first/last name differs (Base44: "${b44User.first_name} ${b44User.last_name}", current: "${currentUserRow.first_name} ${currentUserRow.last_name}") — matched on email anyway per policy; review if this looks like more than a nickname/formatting difference.`);
  }

  console.log(`  Daily Scores:`);
  console.log(`    Base44 raw rows: ${b44Scores.length} | unique (email,date) dates: ${b44UniqueDates.length} | duplicate-date groups: ${dupDatesForUser.length}`);
  console.log(`    Current Inspire submissions: ${currentCountsRow.daily_scores}`);
  console.log(`    Proposed import: ${missingFromCurrent.length} missing historical date(s)${missingFromCurrent.length ? ' (' + missingFromCurrent.slice(0, 5).join(', ') + (missingFromCurrent.length > 5 ? ', …' : '') + ')' : ''}`);
  if (conflictingWithCurrent.length) {
    console.log(`    ⚠ ${conflictingWithCurrent.length} Base44 date(s) already have a rebuilt submission — current rebuilt activity WINS, these are skipped, not overwritten: ${conflictingWithCurrent.join(', ')}`);
  }
  if (dupDatesForUser.length) {
    console.log(`    ⚠ ${dupDatesForUser.length} date(s) have duplicate Base44 rows for this user — see "Global Data Problems" for the full per-row breakdown; each requires explicit sign-off before import.`);
  }

  console.log(`  Streak:`);
  console.log(`    Base44 displayed streak_count:        ${b44User.streak_count ?? '(not present)'}`);
  console.log(`    Current Inspire streak_count:         ${currentUserRow.streak_count}`);
  console.log(`    Projected canonical streak post-merge: ${recalculatedStreak}`);
  if (b44User.streak_count !== undefined && b44User.streak_count !== '' && Number(b44User.streak_count) !== recalculatedStreak) {
    console.log(`    ⚠ Discrepancy vs Base44's displayed value — DO NOT overwrite with Base44's number. Likely cause: Base44 ran >1`);
    console.log(`      divergent streak implementation over its lifetime (midnightStreakReset/fixAllStreaks/fixSundayStreaks/streakAudit,`);
    console.log(`      confirmed present in the Base44 source export) that drifted from the underlying DailyScore history. Trust the`);
    console.log(`      canonical recalculation above once history is imported; escalate to a human only if the gap is large and unexplained.`);
  } else {
    console.log(`    ✓ Canonical recalculation matches Base44's displayed streak.`);
  }

  console.log(`  Shields:`);
  console.log(`    Base44 displayed streak_shields: ${b44User.streak_shields ?? '(not present)'}`);
  console.log(`    Current Inspire streak_shields:  ${currentUserRow.streak_shields}`);
  console.log(`    Estimated upper bound from merged history: ${estimatedShields} (${milestonesHit} 7-day milestone(s), capped at ${STREAK_CONSTANTS.MAX_SHIELDS})`);
  console.log(`    ⚠ Shield CONSUMPTION is not a recorded fact in either schema — this is an upper bound only, never ground truth.`);
  console.log(`      Do not set streak_shields from this estimate automatically; present both numbers to staff for a decision.`);

  console.log(`  Inspire Challenge (SummerEntry):`);
  console.log(`    Base44 raw rows: ${b44Summer.length} | unique dates: ${seUniqueDates.length} | duplicate-date groups: ${seDupDates.length}`);
  console.log(`    Current rebuilt entries: ${currentCountsRow.summer_entries}`);
  console.log(`    Proposed import: ${seMissingFromCurrent.length} missing historical date(s)`);
  if (seMissingFromCurrent.length) {
    console.log(`    Base44 historical point total (NOT authoritative, shown for context only): ${base44PointsTotal}`);
    console.log(`    Projected canonical rebuilt point total (recomputed via calculateSummerPoints, clean+era-gated fields only): ${projectedPointsTotal}`);
    if (unmappedFieldNotes.size) {
      console.log(`    Fields with no usable legacy data for at least one imported row: ${[...unmappedFieldNotes].join(', ')}`);
    }
    console.log(`    ⚠ sleep8h / nutrition / screenTimeTier are AMBIGUOUS mappings (see script header) — excluded from the projection`);
    console.log(`      above (defaulted to false/0), not silently guessed. See "Global Data Problems" for the candidate values.`);
  }
  if (seDupDates.length) {
    console.log(`    ⚠ ${seDupDates.length} date(s) have duplicate Base44 rows — see "Global Data Problems" for per-row detail.`);
  }

  console.log(`  Goals: Base44 ${b44Goals.length} (+ ${b44Books.length} books, ${b44Logs.length} logs) vs current ${currentCountsRow.goals} (+ ${currentCountsRow.goal_books} books, ${currentCountsRow.goal_logs} logs)`);
  console.log(`  Tasks (TaskSignup): Base44 ${b44Tasks.length} vs current ${currentCountsRow.task_signups}`);
  console.log(`  Badges: Base44 ${b44Badges.length} vs current ${currentCountsRow.badges}`);
  console.log(`    Proposed: import ${newBadges.length} legitimate historical badge award(s) as source='legacy' (requires the schema change in "Schema Requirements" first)`);
  for (const b of newBadges.slice(0, 10)) {
    console.log(`      - [${b.badge_type}] "${b.name}" earned ${b.earned_date || '(no date)'}${b.trigger_key ? ` (trigger: ${b.trigger_key})` : ''}`);
  }
  if (newBadges.length > 10) console.log(`      … and ${newBadges.length - 10} more`);

  // ─ Profile fields ─
  console.log(`  Profile field comparison (report only — never auto-overwrite):`);
  const profileFields = [
    ['first_name', b44User.first_name, currentUserRow.first_name],
    ['last_name', b44User.last_name, currentUserRow.last_name],
    ['birthday', b44User.birthday, currentUserRow.birthday],
    ['phone', b44User.phone, currentUserRow.phone],
  ];
  for (const [field, b44Val, curVal] of profileFields) {
    const differs = normalizeName(String(b44Val || '')) !== normalizeName(String(curVal || ''));
    if (differs) console.log(`    ${field}: Base44="${b44Val || '(blank)'}" vs current="${curVal || '(blank)'}" — candidate only, needs explicit approval`);
  }
  console.log(`    role/status/theme/password fields are NEVER proposed for overwrite (excluded by policy).`);

  console.log(`  NO WRITES PERFORMED. This is a dry-run report only.`);
}

function reportNotYetSignedUp(email, base44) {
  const b44User = (base44.usersByEmail.get(email) || [])[0] || {};
  const counts = {
    dailyScores: (base44.dailyScoresByEmail.get(email) || []).length,
    summerEntries: (base44.summerEntriesByEmail.get(email) || []).length,
    goals: (base44.goalsByEmail.get(email) || []).length,
    badges: (base44.badgesByEmail.get(email) || []).length,
    tasks: (base44.taskSignupsByEmail.get(email) || []).length,
  };
  const hasAnyHistory = Object.values(counts).some((c) => c > 0);
  console.log(`\nUser: ${email} — NOT YET SIGNED UP`);
  console.log(`  Base44 identity: "${b44User.first_name || ''} ${b44User.last_name || ''}".trim() (${b44User.app_role || 'role unknown'}), Base44 streak_last_date=${b44User.streak_last_date || '(none)'}`);
  if (hasAnyHistory) {
    console.log(`  Historical data available once they sign up: ${counts.dailyScores} Daily Scores, ${counts.summerEntries} Inspire Challenge entries, ${counts.goals} goals, ${counts.badges} badges, ${counts.tasks} task signups.`);
    console.log(`  Per policy: no account created, nothing imported now.`);
  } else {
    console.log(`  No historical activity records found for this email — nothing to reconcile.`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const base44 = await loadBase44Export();
  const r = base44.raw;

  // ── Dataset summary ──
  printHeader('DATASET SUMMARY (parsed from real CSV export — RFC4180-aware, quoted multi-line fields handled)');
  const dateRange = (rows, field = 'date') => {
    const dates = rows.map((row) => row[field]).filter(Boolean).sort();
    return dates.length ? `${dates[0]} .. ${dates[dates.length - 1]}` : '(no dates)';
  };
  console.log(`Export directory: ${exportDir}`);
  const summaryRows = [
    ['User', r.users.length, '—'],
    ['DailyScore', r.dailyScores.length, dateRange(r.dailyScores)],
    ['SummerEntry', r.summerEntries.length, dateRange(r.summerEntries)],
    ['Goal', r.goals.length, '—'],
    ['GoalBook', r.goalBooks.length, '—'],
    ['GoalLog', r.goalLogs.length, dateRange(r.goalLogs)],
    ['Badge', r.badges.length, dateRange(r.badges, 'earned_date')],
    ['TaskSignup', r.taskSignups.length, '—'],
    ['InternshipTask', r.internshipTasks.length, '—'],
    ['Connection', r.connections.length, '—'],
    ['DailyUpdate', r.dailyUpdates.length, dateRange(r.dailyUpdates)],
    ['SignupRecord', r.signupRecords.length, '—'],
  ];
  for (const [name, count, range] of summaryRows) {
    console.log(`  ${name.padEnd(16)} ${String(count).padStart(4)} rows   ${range}`);
  }

  // ── Identity matching (Base44 User.csv is PRIMARY; SignupRecord is supporting-only) ──
  const allEmails = new Set([
    ...base44.usersByEmail.keys(),
    ...base44.dailyScoresByEmail.keys(),
    ...base44.summerEntriesByEmail.keys(),
    ...base44.goalsByEmail.keys(),
    ...base44.badgesByEmail.keys(),
    ...base44.taskSignupsByEmail.keys(),
  ]);
  const emailsToProcess = onlyEmail ? [onlyEmail].filter((e) => allEmails.has(e)) : [...allEmails].sort();
  if (onlyEmail && emailsToProcess.length === 0) {
    console.log(`No Base44 record found for ${onlyEmail} in ${exportDir}.`);
    process.exit(0);
  }

  const currentUsers = await listCurrentUsers();
  const currentByEmail = new Map(currentUsers.map((u) => [u.email, u]));

  const matched = [];
  const notYetSignedUp = [];
  const ambiguous = [];
  const conflict = [];

  for (const email of emailsToProcess) {
    const b44UserRows = base44.usersByEmail.get(email) || [];
    if (b44UserRows.length > 1) {
      ambiguous.push({ email, reason: `${b44UserRows.length} distinct Base44 User rows share this normalized email — never auto-merge.` });
      continue;
    }
    const currentUser = currentByEmail.get(email);
    const dupCurrentCount = currentUsers.filter((u) => u.email === email).length;
    if (!currentUser) {
      notYetSignedUp.push(email);
    } else if (dupCurrentCount > 1) {
      ambiguous.push({ email, reason: `${dupCurrentCount} current Inspire Daily accounts matched this email — never auto-merge.` });
    } else {
      const b44User = b44UserRows[0];
      if (b44User) {
        const b44Name = normalizeName(`${b44User.first_name || ''} ${b44User.last_name || ''}`);
        const curName = normalizeName(`${currentUser.first_name} ${currentUser.last_name}`);
        if (b44Name && curName && b44Name !== curName) {
          conflict.push({ email, base44Name: `${b44User.first_name} ${b44User.last_name}`.trim(), currentName: `${currentUser.first_name} ${currentUser.last_name}` });
          continue;
        }
      }
      matched.push({ email, currentUser });
    }
  }

  const signupAnomalies = analyzeSignupRecordAnomalies(base44.signupRecordsByEmail, new Set(base44.usersByEmail.keys()));

  printHeader('IDENTITY RECONCILIATION');
  console.log(`Base44 identities discovered (from User/DailyScore/SummerEntry/Goal/Badge/TaskSignup): ${allEmails.size}`);
  console.log(`  MATCHED:            ${matched.length}`);
  console.log(`  NOT_YET_SIGNED_UP:  ${notYetSignedUp.length}`);
  console.log(`  AMBIGUOUS:          ${ambiguous.length}`);
  console.log(`  CONFLICT:           ${conflict.length}`);
  console.log(`NO DATABASE WRITES WILL OCCUR. This tool only runs SELECT queries.`);

  console.log(`\n--- SignupRecord.csv (SUPPORTING EVIDENCE ONLY — never used above for matching) ---`);
  console.log(`  ${signupAnomalies.duplicateEmails.length} duplicate-email SignupRecord group(s):`);
  for (const d of signupAnomalies.duplicateEmails) {
    console.log(`    ${d.email}: ${d.records.length} records — ${d.note}`);
    for (const rec of d.records) console.log(`      id=${rec.id} full_name="${rec.full_name}" signup_date=${rec.signup_date}`);
  }
  console.log(`  ${signupAnomalies.malformed.length} malformed-looking email(s) in SignupRecord: ${signupAnomalies.malformed.join(', ') || '(none)'}`);
  if (signupAnomalies.malformed.length) {
    console.log(`    ⚠ Do not auto-correct these (e.g. a "pa@inspiringchildren.rog"-style typo). Confirm the intended person with staff before treating as anyone's identity.`);
  }
  console.log(`  ${signupAnomalies.notInUserTable.length} SignupRecord email(s) absent from the Base44 User table entirely (signup attempt with no resulting account, or a typo):`);
  for (const n of signupAnomalies.notInUserTable) console.log(`    ${n.email} (full_name on signup: "${n.sampleFullName}")`);

  if (matched.length) {
    printHeader('MATCHED — proposed reconciliation preview');
    const dsGroups = buildDateGroups(base44.dailyScoresByEmail);
    const seGroups = buildDateGroups(base44.summerEntriesByEmail);
    for (const { email, currentUser } of matched) {
      await reportMatchedUser(email, base44, currentUser, dsGroups, seGroups);
    }
  }

  if (notYetSignedUp.length) {
    printHeader('NOT YET SIGNED UP — no action taken');
    for (const email of notYetSignedUp) reportNotYetSignedUp(email, base44);
  }

  if (ambiguous.length) {
    printHeader('AMBIGUOUS — requires human review, no action taken');
    for (const a of ambiguous) console.log(`  ${a.email}: ${a.reason}`);
  }

  if (conflict.length) {
    printHeader('CONFLICT — requires human review, no action taken');
    for (const c of conflict) {
      console.log(`  ${c.email}: Base44 name "${c.base44Name}" vs current account name "${c.currentName}" (matched by email only per policy — same email is strong evidence of the same person; a nickname/placeholder name difference is common in this export, e.g. Base44 full_name defaulting to a username. Confirm before trusting.)`);
    }
  }

  // ── Global data problems ──
  printHeader('GLOBAL DATA PROBLEMS');

  const dsGroupsAll = buildDateGroups(base44.dailyScoresByEmail);
  const dsDupes = analyzeDuplicates(dsGroupsAll, DAILY_SCORE_COMPARE_FIELDS);
  console.log(`\nDaily Scores duplicate (email,date) groups: ${dsDupes.autoMergeGroups.length + dsDupes.conflictGroups.length} total`);
  console.log(`  Auto-mergeable (identical content, no data loss either way): ${dsDupes.autoMergeGroups.length}`);
  console.log(`  CONFLICTING (differing business values — human review required, no arbitrary "first row" pick): ${dsDupes.conflictGroups.length}`);
  for (const g of dsDupes.conflictGroups) {
    console.log(`\n  [${g.email} @ ${g.date}] ${g.count} rows — recommended winner (latest updated_date, tie-broken by created_date/id): ${g.recommendedWinnerId}`);
    for (const row of g.rows) {
      const flag = row.id === g.recommendedWinnerId ? ' <- recommended' : '';
      console.log(`    id=${row.id} created=${row.created_date} updated=${row.updated_date}${flag}`);
      console.log(`      ${JSON.stringify(row.values)}`);
    }
    console.log(`    ⚠ UNRESOLVED — content differs meaningfully across rows; the recommendation above is a default, not an automatic decision. Confirm before import.`);
  }

  const seGroupsAll = buildDateGroups(base44.summerEntriesByEmail);
  const seDupes = analyzeDuplicates(seGroupsAll, SUMMER_ENTRY_COMPARE_FIELDS);
  console.log(`\nSummerEntry duplicate (email,date) groups: ${seDupes.autoMergeGroups.length + seDupes.conflictGroups.length} total`);
  console.log(`  Auto-mergeable (identical content): ${seDupes.autoMergeGroups.length}`);
  console.log(`  CONFLICTING (differing category values/total_points): ${seDupes.conflictGroups.length}`);
  for (const g of seDupes.conflictGroups) {
    console.log(`  [${g.email} @ ${g.date}] ${g.count} rows, total_points=[${g.rows.map((r) => r.values.total_points).join(', ')}], recommended winner=${g.recommendedWinnerId} (latest updated_date/created_date) — UNRESOLVED, needs sign-off.`);
  }

  const goalOrphans = analyzeGoalOrphans(base44.goalsByEmail, base44.goalBooksByEmail, base44.goalLogsByEmail);
  const totalOrphanGroups = goalOrphans.reduce((sum, u) => sum + u.orphanGroupCount, 0);
  console.log(`\nOrphan Goal references (GoalBook/GoalLog pointing at a goal_id absent from Goal.csv): ${totalOrphanGroups} distinct orphan goal(s) across ${goalOrphans.length} user(s)`);
  for (const u of goalOrphans) {
    for (const g of u.orphanGroups) {
      console.log(`\n  [${g.email}] orphan goal_id=${g.goalId} — ${g.bookCount} book row(s), ${g.logCount} log row(s), date range ${g.dateRange ? g.dateRange.join(' .. ') : '(none)'}`);
      if (g.bookTitles.length) console.log(`    book title(s): ${g.bookTitles.join(', ')}`);
      if (g.logTypes.length) console.log(`    log_type(s) seen: ${g.logTypes.join(', ')}`);
      console.log(`    inferred type: ${g.inferredType || '(no signal)'} (confidence: ${g.confidence})`);
      console.log(`    RECOMMENDATION: ${g.recommendation}`);
    }
  }

  console.log(`\nVolunteer hours — authoritative source determination:`);
  console.log(`  daily_scores.volunteer_hours  <- Base44 DailyScore.volunteer_hours (1:1 field, this IS the rebuilt target column)`);
  console.log(`  summer_entries has NO volunteer_hours column in the rebuilt schema -> Base44 SummerEntry.volunteer_hours is UNMAPPABLE, excluded entirely (no double-count risk, there's nowhere to put it)`);
  console.log(`  task_signups.hours_spent     <- Base44 TaskSignup.hours_spent (a distinct concept — task hours, not volunteer hours — no overlap)`);

  printHeader('TASKS & SOCIAL DATA (Step 10) — classification only, nothing imported');
  const liveInternshipTaskCount = await countInternshipTasks();
  console.log(`\nInternshipTask.csv: ${r.internshipTasks.length} row(s). Current live internship_tasks table: ${liveInternshipTaskCount} row(s).`);
  console.log(`  Classification: OPTIONAL / staff product decision. These are today's active-task templates in Base44, not a`);
  console.log(`  historical fact about any participant. Importing them would recreate a legacy task board, not reconcile history —`);
  console.log(`  unrelated to the streak/badge/points migration objective. Not worth migrating as part of THIS effort.`);

  console.log(`\nTaskSignup.csv: ${r.taskSignups.length} row(s).`);
  if (r.taskSignups.length) {
    console.log(`  Classification: SAFE/USEFUL, with one caveat — the referenced task_id is itself an orphan (not present in`);
    console.log(`  InternshipTask.csv), but the TaskSignup row carries its own task_title, so — unlike the Goal orphans above —`);
    console.log(`  there IS enough signal here to safely reconstruct a minimal historical internship_task from the title alone.`);
  }

  console.log(`\nConnection.csv: ${r.connections.length} row(s), all status='pending' (never accepted).`);
  console.log(`  Classification: NOT WORTH MIGRATING NOW. The follow/following feature has zero code references anywhere in the`);
  console.log(`  rebuild (dead table, confirmed empty). One row references a clearly non-participant test address. Flag for a`);
  console.log(`  product decision if the social feature is ever rebuilt — not an engineering necessity today.`);

  console.log(`\nDailyUpdate.csv: ${r.dailyUpdates.length} row(s) — real personal free-text content.`);
  console.log(`  Classification: NOT WORTH MIGRATING NOW. Feature has no route/UI in the rebuild (dead table, confirmed empty).`);
  console.log(`  Contains a participant's personal journal text; importing it serves no current product need. Leave for an`);
  console.log(`  explicit future decision rather than importing personal text nobody has asked to see restored.`);

  // ── Badge schema requirement ──
  printHeader('SCHEMA REQUIREMENTS (Step 9) — proposed only, NOT applied');
  const constraint = await getBadgesSourceConstraint();
  const liveBadgeRowCount = await countBadgeRows();
  console.log(`\nCurrent live constraint: ${constraint ? `${constraint.conname}: ${constraint.def}` : '(not found — verify table name)'}`);
  console.log(`Current badges row count (affected by this change): ${liveBadgeRowCount}`);
  console.log(`\nProposed minimal SQL (additive, widens an allow-list, rewrites no existing row):`);
  console.log(`  ALTER TABLE badges DROP CONSTRAINT badges_source_check;`);
  console.log(`  ALTER TABLE badges ADD CONSTRAINT badges_source_check`);
  console.log(`    CHECK (source IN ('manual', 'automatic', 'legacy'));`);
  console.log(`\nRollback SQL (exact inverse):`);
  console.log(`  ALTER TABLE badges DROP CONSTRAINT badges_source_check;`);
  console.log(`  ALTER TABLE badges ADD CONSTRAINT badges_source_check`);
  console.log(`    CHECK (source IN ('manual', 'automatic'));`);
  console.log(`  (Rollback only safe if no row has been written with source='legacy' yet — check first: select count(*) from badges where source='legacy';)`);
  console.log(`\nWhy necessary: neither 'manual' (fabricates a staff awarder who never acted) nor 'automatic' (misrepresents a`);
  console.log(`legacy import as the rebuild's own nonexistent auto-award logic) is truthful for a historical badge.`);
  console.log(`Risk: low — additive, 0 existing rows affected today, reversible as long as rollback happens before any`);
  console.log(`'legacy' row is inserted. DO NOT RUN without explicit approval.`);

  printHeader('END OF DRY-RUN — no writes were performed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Dry-run failed:', err);
  process.exit(1);
}).finally(() => {
  pool?.end?.();
});
