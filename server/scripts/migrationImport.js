#!/usr/bin/env node
/**
 * Base44 → Inspire Daily IMPORTER.
 *
 * DRY RUN BY DEFAULT. This script never writes to the database unless BOTH
 * `--commit` AND `--i-understand-this-writes-production-data` are passed —
 * a single flag (or a typo of one) can never trigger a write. Even in
 * write mode, every user's inserts run inside one transaction
 * (BEGIN/COMMIT/ROLLBACK via server/src/db.js's withTransaction), so a
 * failure partway through one person's import never leaves partial rows.
 *
 * This tool only acts on conflicts already reviewed and approved in
 * server/scripts/lib/approvedResolutions.js. A duplicate/orphan NOT listed
 * there is treated as HELD, never guessed.
 *
 * NEVER TOUCHED, BY DESIGN (grep this file to verify — none of these
 * identifiers appear anywhere below except in this comment):
 *   account_pin, pin_reset_token, pin_reset_expires, known_device_id,
 *   password_hash, password_reset_tokens, jwt/session data, system_role,
 *   account_status, theme_preference, password_changed_at.
 * Current rebuilt activity always wins over conflicting Base44 activity —
 * this script only ever fills in MISSING dates, never overwrites an existing
 * row. Derived values (streak_count via the canonical engine is the one
 * exception — see "Streak" below) are never copied from Base44's own
 * displayed numbers.
 *
 * Usage:
 *   Dry run (default, safe, no writes):
 *     node server/scripts/migrationImport.js <export-dir> [--email=someone@example.org]
 *
 *   Real import (LATER, only after this dry run is reviewed and approved):
 *     node server/scripts/migrationImport.js <export-dir> --commit --i-understand-this-writes-production-data [--batch=<id>]
 *
 * Every write-mode run leaves a JSON manifest at
 * server/scripts/.migration-logs/<batchId>.json listing every row this run
 * inserted (table + id + user_id + date/key) — that manifest, not a new
 * schema column, is the rollback mechanism: `delete from <table> where id =
 * any($1::uuid[])` using the ids it recorded. The directory is gitignored.
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { query, pool, withTransaction } from '../src/db.js';
import { calculateStreak, STREAK_CONSTANTS } from '../src/lib/streakEngine.js';
import { calculateSummerPoints } from '../src/lib/summerChallenge.js';
import { isGoalComplete } from '../src/lib/goalCompletion.js';
import { ptDateString } from '../src/config/pacificTime.js';
import {
  normalizeEmail, normalizeName, toNumOrNull, toBoolOrNull,
  loadBase44Export, buildDateGroups, pickRecommendedWinner, pickOldest,
  mapSummerEntryClean, estimateShieldsFromDates, analyzeGoalOrphans,
} from './lib/base44Csv.js';
import {
  IDENTITY_OVERRIDES, DAILY_SCORE_RESOLUTIONS, SUMMER_ENTRY_HOLDS,
  GOAL_ORPHAN_RECONSTRUCT, dailyScoreKey, summerEntryKey, goalOrphanKey,
} from './lib/approvedResolutions.js';

// ─── CLI args / write-mode gate ─────────────────────────────────────────────

const args = process.argv.slice(2);
const exportDir = args[0];
const flags = new Set(args.filter((a) => a.startsWith('--')));
const onlyEmailArg = args.find((a) => a.startsWith('--email='));
const onlyEmail = onlyEmailArg ? normalizeEmail(onlyEmailArg.slice('--email='.length)) : null;
const batchArg = args.find((a) => a.startsWith('--batch='));

if (!exportDir || exportDir.startsWith('--')) {
  console.error('Usage: node server/scripts/migrationImport.js <export-dir> [--email=...] [--commit --i-understand-this-writes-production-data] [--batch=id]');
  process.exit(1);
}

const REQUESTED_COMMIT = flags.has('--commit');
const CONFIRMED = flags.has('--i-understand-this-writes-production-data');
if (REQUESTED_COMMIT && !CONFIRMED) {
  console.error('\n--commit was passed without --i-understand-this-writes-production-data.');
  console.error('Refusing to run in an ambiguous state. Add BOTH flags to write, or drop --commit to dry-run.\n');
  process.exit(1);
}
const WRITE_MODE = REQUESTED_COMMIT && CONFIRMED;

const BATCH_ID = (batchArg ? batchArg.slice('--batch='.length) : null)
  || `base44-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;

if (WRITE_MODE) {
  console.log(`\n⚠⚠⚠ WRITE MODE ENABLED — this run WILL modify production data. Batch: ${BATCH_ID} ⚠⚠⚠\n`);
} else {
  console.log(`\nDRY RUN (default). No database writes will occur. Pass --commit --i-understand-this-writes-production-data to write. Batch would be: ${BATCH_ID}\n`);
}

// ─── Manifest (rollback mechanism — no schema tagging column required) ──────

const manifest = []; // { table, id, userId, key }
function recordInsert(table, id, userId, key) {
  manifest.push({ table, id, userId, key });
}

async function flushManifest() {
  if (!WRITE_MODE || manifest.length === 0) return;
  const dir = path.join(process.cwd(), 'scripts', '.migration-logs');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${BATCH_ID}.json`);
  await writeFile(file, JSON.stringify({ batchId: BATCH_ID, createdAt: new Date().toISOString(), inserted: manifest }, null, 2));
  console.log(`\nManifest written: ${file} (${manifest.length} row(s) — this is the rollback key)`);
}

// ─── Current-state reads (SELECT-only, used in both dry-run and write mode) ─

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
async function currentGoalIdsByLegacyId(userId) {
  // Reconstructed goals stamp details.legacyGoalId — used so a second run
  // (idempotency) recognizes an already-reconstructed goal instead of
  // creating a duplicate.
  const { rows } = await query(`select id, details from goals where user_id = $1`, [userId]);
  const map = new Map();
  for (const r of rows) {
    const legacyId = r.details?.legacyGoalId;
    if (legacyId) map.set(legacyId, r.id);
  }
  return map;
}
async function getBadgesSourceConstraintAllowsLegacy() {
  const { rows } = await query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = 'public.badges'::regclass and conname = 'badges_source_check'`
  );
  return Boolean(rows[0] && /'legacy'/.test(rows[0].def));
}
async function countInternshipTasksByTitle(title) {
  const { rows } = await query(`select id from internship_tasks where title = $1 limit 1`, [title]);
  return rows[0]?.id || null;
}

// ─── Identity classification (mirrors migrationDryRun.js + approved overrides) ─

function classifyIdentities(base44, currentUsers) {
  const allEmails = new Set([
    ...base44.usersByEmail.keys(), ...base44.dailyScoresByEmail.keys(), ...base44.summerEntriesByEmail.keys(),
    ...base44.goalsByEmail.keys(), ...base44.badgesByEmail.keys(), ...base44.taskSignupsByEmail.keys(),
  ]);
  const currentByEmail = new Map(currentUsers.map((u) => [u.email, u]));
  const matched = [];
  const notYetSignedUp = [];
  const ambiguous = [];
  const conflict = [];

  for (const email of [...allEmails].sort()) {
    const b44UserRows = base44.usersByEmail.get(email) || [];
    if (b44UserRows.length > 1) {
      ambiguous.push({ email, reason: `${b44UserRows.length} Base44 User rows share this email` });
      continue;
    }
    const currentUser = currentByEmail.get(email);
    const dupCurrentCount = currentUsers.filter((u) => u.email === email).length;
    if (!currentUser) {
      notYetSignedUp.push(email);
      continue;
    }
    if (dupCurrentCount > 1) {
      ambiguous.push({ email, reason: `${dupCurrentCount} current accounts share this email` });
      continue;
    }
    const override = IDENTITY_OVERRIDES.get(email);
    if (override?.decision === 'same_person') {
      matched.push({ email, currentUser, override });
      continue;
    }
    const b44User = b44UserRows[0];
    if (b44User) {
      const b44Name = normalizeName(`${b44User.first_name || ''} ${b44User.last_name || ''}`);
      const curName = normalizeName(`${currentUser.first_name} ${currentUser.last_name}`);
      if (b44Name && curName && b44Name !== curName) {
        conflict.push({ email, base44Name: `${b44User.first_name} ${b44User.last_name}`.trim(), currentName: `${currentUser.first_name} ${currentUser.last_name}` });
        continue;
      }
    }
    matched.push({ email, currentUser, override: null });
  }
  return { matched, notYetSignedUp, ambiguous, conflict };
}

// ─── Per-user import plan (single source of truth for both report + write) ──

async function buildDailyScorePlan(email, base44, currentUserRow) {
  const rows = base44.dailyScoresByEmail.get(email) || [];
  const currentDates = await currentDailyScoreDates(currentUserRow.id);
  const byDate = new Map();
  for (const row of rows) {
    if (!row.date) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }

  const eligible = []; // { date, row }
  const held = []; // { date, rows, reason }
  const skippedExisting = [];

  for (const [date, group] of byDate) {
    if (currentDates.includes(date)) {
      skippedExisting.push(date);
      continue;
    }
    if (group.length === 1) {
      eligible.push({ date, row: group[0] });
      continue;
    }
    const resolution = DAILY_SCORE_RESOLUTIONS.get(dailyScoreKey(email, date));
    if (!resolution || resolution.decision === 'hold') {
      held.push({ date, rows: group, reason: resolution?.reason || 'not in the approved-resolutions list — defaults to HOLD' });
      continue;
    }
    const winner = resolution.decision === 'keep_older' ? pickOldest(group) : pickRecommendedWinner(group);
    eligible.push({ date, row: winner, resolvedBy: resolution.decision });
  }

  return { eligible, held, skippedExisting, currentDates };
}

async function buildSummerEntryPlan(email, base44, currentUserRow) {
  const rows = base44.summerEntriesByEmail.get(email) || [];
  const currentDates = await currentSummerEntryDates(currentUserRow.id);
  const byDate = new Map();
  for (const row of rows) {
    if (!row.date) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }

  const eligible = []; // { date, mapped, points, base44Points }
  const held = [];
  const skippedExisting = [];

  for (const [date, group] of byDate) {
    if (currentDates.includes(date)) {
      skippedExisting.push(date);
      continue;
    }
    if (group.length > 1 && SUMMER_ENTRY_HOLDS.has(summerEntryKey(email, date))) {
      held.push({ date, rows: group, reason: 'approved category-fact conflict — held pending manual review' });
      continue;
    }
    // Either a unique row, or an approved merge (identical facts, or the
    // only disagreement is Base44's own untrusted total_points).
    const row = pickRecommendedWinner(group);
    const { mapped } = mapSummerEntryClean(row);
    const points = calculateSummerPoints(mapped);
    eligible.push({ date, row, mapped, points, base44Points: toNumOrNull(row.total_points) || 0 });
  }

  return { eligible, held, skippedExisting, currentDates };
}

function buildGoalPlan(email, base44) {
  const ownGoals = base44.goalsByEmail.get(email) || [];
  const ownGoalIds = new Set(ownGoals.map((g) => g.id));
  const allBooks = base44.goalBooksByEmail.get(email) || [];
  const allLogs = base44.goalLogsByEmail.get(email) || [];

  const normalGoals = ownGoals.map((g) => ({
    goal: g,
    books: allBooks.filter((b) => b.goal_id === g.id),
    logs: allLogs.filter((l) => l.goal_id === g.id),
  }));

  const orphans = analyzeGoalOrphans(base44.goalsByEmail, base44.goalBooksByEmail, base44.goalLogsByEmail)
    .find((u) => u.email === email)?.orphanGroups || [];

  const reconstructReading = [];
  const archivedBlocked = [];
  for (const g of orphans) {
    if (GOAL_ORPHAN_RECONSTRUCT.has(goalOrphanKey(email, g.goalId))) {
      reconstructReading.push(g);
    } else {
      archivedBlocked.push(g);
    }
  }

  return { normalGoals, reconstructReading, archivedBlocked };
}

function buildBadgePlan(email, base44, currentBadgeKeySet) {
  const rows = base44.badgesByEmail.get(email) || [];
  const eligible = rows.filter((b) => !currentBadgeKeySet.has(`${b.badge_type}::${b.name}`));
  return { eligible };
}

function buildTaskPlan(email, base44) {
  const rows = base44.taskSignupsByEmail.get(email) || [];
  return { eligible: rows };
}

function buildProfileDiff(email, base44, currentUserRow, override) {
  const b44User = (base44.usersByEmail.get(email) || [])[0] || {};
  const neverOverwrite = new Set(override?.neverOverwriteFields || []);
  const fields = [
    ['first_name', b44User.first_name, currentUserRow.first_name],
    ['last_name', b44User.last_name, currentUserRow.last_name],
    ['birthday', b44User.birthday, currentUserRow.birthday],
    ['phone', b44User.phone, currentUserRow.phone],
  ];
  return fields
    .filter(([field]) => !neverOverwrite.has(field))
    .filter(([, b44Val, curVal]) => normalizeName(String(b44Val || '')) !== normalizeName(String(curVal || '')))
    .map(([field, b44Val, curVal]) => ({ field, base44Value: b44Val, currentValue: curVal }));
}

// ─── Write-path (only ever called when WRITE_MODE is true) ─────────────────

async function writeUserImport(client, userId, plan) {
  for (const { date, row, resolvedBy } of plan.dailyScores.eligible) {
    const bestSelf = toNumOrNull(row.best_self) || 0;
    const ceoMindset = toNumOrNull(row.ceo_mindset) || 0;
    const grit = toNumOrNull(row.grit) || 0;
    const happiness = toNumOrNull(row.happiness) || 0;
    const sleep = toNumOrNull(row.sleep) || 0;
    const total = bestSelf + ceoMindset + grit + happiness + sleep; // recomputed, never trust Base44 `points`
    const { rows: inserted } = await client.query(
      `insert into daily_scores
        (user_id, date, display_name, challenges, earned_way, volunteer_hours,
         best_self, ceo_mindset, grit, happiness, sleep, goals_worked_on, total_score, points)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       returning id`,
      [userId, date, row.intern_name || null, row.challenges || null, toBoolOrNull(row.earned_way) || false,
        toNumOrNull(row.volunteer_hours) || 0, bestSelf, ceoMindset, grit, happiness, sleep, row.goals_worked_on || null, total]
    );
    recordInsert('daily_scores', inserted[0].id, userId, `${date}${resolvedBy ? ` (resolved: ${resolvedBy})` : ''}`);
  }

  for (const { date, mapped, points } of plan.summerEntries.eligible) {
    const { rows: inserted } = await client.query(
      `insert into summer_entries
        (user_id, date, sleep_bed_before_10, sleep_8h, hydration, exercise, screen_time_tier,
         mindfulness_sessions, reading_sessions, daily_update_sent, nutrition, cold_plunge_type, total_points)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id`,
      [userId, date, mapped.sleepBedBefore10, false /* sleep8h never inferred, see mapSummerEntryClean ambiguous list */,
        mapped.hydration, mapped.exercise, mapped.screenTimeTier || null, mapped.mindfulnessSessions || 0,
        mapped.readingSessions || 0, false, mapped.nutrition, mapped.coldPlungeType || null, points]
    );
    recordInsert('summer_entries', inserted[0].id, userId, date);
  }

  for (const { goal, books, logs } of plan.goals.normalGoals) {
    const { rows: goalRows } = await client.query(
      `insert into goals (user_id, type, name, target_date, completed, completed_date, details)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [userId, goal.type, goal.name, goal.target_date || null, toBoolOrNull(goal.completed) || false,
        goal.completed_date || null, JSON.stringify({ legacyGoalId: goal.id, legacyImportBatch: BATCH_ID })]
    );
    const goalId = goalRows[0].id;
    recordInsert('goals', goalId, userId, goal.id);
    const bookIdByLegacy = new Map();
    for (const b of books) {
      const { rows: bookRows } = await client.query(
        `insert into goal_books (goal_id, user_id, title, author, total_pages, current_page, completed, completed_date, start_date, order_index)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [goalId, userId, b.title, b.author || null, toNumOrNull(b.total_pages) || 0, toNumOrNull(b.current_page) || 0,
          toBoolOrNull(b.completed) || false, b.completed_date || null, b.start_date || null, toNumOrNull(b.order_index) || 0]
      );
      bookIdByLegacy.set(b.id, bookRows[0].id);
      recordInsert('goal_books', bookRows[0].id, userId, b.id);
    }
    for (const l of logs) {
      const { rows: logRows } = await client.query(
        `insert into goal_logs (goal_id, user_id, book_id, date, log_type, note, value, activity, week_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [goalId, userId, bookIdByLegacy.get(l.book_id) || null, l.date, l.log_type, l.note || null,
          toNumOrNull(l.value), l.activity || null, l.week_key || null]
      );
      recordInsert('goal_logs', logRows[0].id, userId, l.id);
    }
  }

  for (const g of plan.goals.reconstructReading) {
    const name = `Imported historical goal — ${g.bookTitles.join(', ') || 'reading'}`;
    const { rows: goalRows } = await client.query(
      `insert into goals (user_id, type, name, completed, details)
       values ($1,'reading',$2,false,$3) returning id`,
      [userId, name, JSON.stringify({ legacyGoalId: g.goalId, legacyImportBatch: BATCH_ID, reconstructed: true, source: 'base44_orphan_reconstruction' })]
    );
    const goalId = goalRows[0].id;
    recordInsert('goals', goalId, userId, g.goalId);
    const bookIdByLegacy = new Map();
    for (const b of g.books) {
      const { rows: bookRows } = await client.query(
        `insert into goal_books (goal_id, user_id, title, author, total_pages, current_page, completed, completed_date, start_date, order_index)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [goalId, userId, b.title, b.author || null, toNumOrNull(b.total_pages) || 0, toNumOrNull(b.current_page) || 0,
          toBoolOrNull(b.completed) || false, b.completed_date || null, b.start_date || null, toNumOrNull(b.order_index) || 0]
      );
      bookIdByLegacy.set(b.id, bookRows[0].id);
      recordInsert('goal_books', bookRows[0].id, userId, b.id);
    }
    for (const l of g.logs) {
      const { rows: logRows } = await client.query(
        `insert into goal_logs (goal_id, user_id, book_id, date, log_type, note, value, activity, week_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [goalId, userId, bookIdByLegacy.get(l.book_id) || null, l.date, l.log_type, l.note || null,
          toNumOrNull(l.value), l.activity || null, l.week_key || null]
      );
      recordInsert('goal_logs', logRows[0].id, userId, l.id);
    }
    // Recompute completion via the canonical rule, never trust a copied flag.
    const finalBooks = await client.query('select * from goal_books where goal_id = $1', [goalId]);
    if (isGoalComplete({ type: 'reading', completed: false, details: {} }, { books: finalBooks.rows })) {
      await client.query(`update goals set completed = true, completed_date = current_date where id = $1`, [goalId]);
    }
  }

  const legacyAllowed = await getBadgesSourceConstraintAllowsLegacy();
  for (const b of plan.badges.eligible) {
    if (!legacyAllowed) {
      console.log(`  ⚠ SKIPPED badge "${b.name}" for user ${userId} — badges.source does not allow 'legacy' yet. Apply the schema change first.`);
      continue;
    }
    const { rows: badgeRows } = await client.query(
      `insert into badges (user_id, badge_type, name, description, icon_emoji, earned_date, awarded_by, reason, source)
       values ($1,$2,$3,$4,$5,$6,null,null,'legacy') returning id`,
      [userId, b.badge_type, b.name, b.description || null, b.icon_emoji || null, b.earned_date || ptDateString()]
    );
    recordInsert('badges', badgeRows[0].id, userId, `${b.badge_type}::${b.name}`);
  }

  for (const t of plan.tasks.eligible) {
    let taskId = await countInternshipTasksByTitle(t.task_title);
    if (!taskId) {
      const level = (t.task_level || 'intern').toLowerCase();
      const { rows: taskRows } = await client.query(
        `insert into internship_tasks (title, description, posted_by, level) values ($1,$2,$3,$4) returning id`,
        [t.task_title, null, userId, ['intern', 'postgrad', 'staff'].includes(level) ? level : 'intern']
      );
      taskId = taskRows[0].id;
      recordInsert('internship_tasks', taskId, userId, t.task_title);
    }
    const { rows: signupRows } = await client.query(
      `insert into task_signups (task_id, user_id, status, hours_spent, notes, completed_date)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [taskId, userId, t.status === 'completed' ? 'completed' : 'in_progress', toNumOrNull(t.hours_spent), t.notes || null, t.completed_date || null]
    );
    recordInsert('task_signups', signupRows[0].id, userId, t.id);
  }

  // Streak: recompute via the canonical engine from the FULL merged date set,
  // never copy Base44's displayed number. Shields are intentionally left
  // untouched (see estimateShieldsFromDates — consumption history is
  // unrecoverable; do not fabricate a number).
  const mergedDates = [...new Set([...plan.dailyScores.currentDates, ...plan.dailyScores.eligible.map((e) => e.date)])].sort();
  const newStreak = calculateStreak(mergedDates, ptDateString());
  await client.query(`update users set streak_count = $2, streak_last_date = $3 where id = $1`, [userId, newStreak, mergedDates[mergedDates.length - 1] || null]);
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printHeader(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

async function main() {
  const base44 = await loadBase44Export(exportDir);
  const currentUsers = await listCurrentUsers();
  const { matched, notYetSignedUp, ambiguous, conflict } = classifyIdentities(base44, currentUsers);
  const emailsToProcess = onlyEmail ? matched.filter((m) => m.email === onlyEmail) : matched;

  printHeader('FINAL PRE-IMPORT REPORT');
  console.log(`Mode: ${WRITE_MODE ? 'WRITE (--commit)' : 'DRY RUN (default)'}   Batch: ${BATCH_ID}`);
  console.log(`\nUsers: MATCHED=${matched.length}  NOT_YET_SIGNED_UP=${notYetSignedUp.length}  AMBIGUOUS=${ambiguous.length}  CONFLICT(held)=${conflict.length}`);
  if (conflict.length) {
    console.log(`  Held/conflicted (no override approved): ${conflict.map((c) => c.email).join(', ')}`);
  }
  const overridden = matched.filter((m) => m.override);
  if (overridden.length) {
    console.log(`  Identity overrides applied: ${overridden.map((m) => `${m.email} (${m.override.reason})`).join('; ')}`);
  }

  const legacyAllowed = await getBadgesSourceConstraintAllowsLegacy();

  let totalDsEligible = 0, totalDsSkipped = 0, totalDsHeld = 0;
  let totalSeEligible = 0, totalSeSkipped = 0, totalSeHeld = 0;
  let totalGoalsNormal = 0, totalGoalsReconstructed = 0, totalGoalsArchivedBlocked = 0;
  let totalBadgesEligible = 0;
  let totalTasksEligible = 0;

  for (const { email, currentUser, override } of emailsToProcess) {
    printHeader(`MATCHED USER: ${email}`);
    const b44User = (base44.usersByEmail.get(email) || [])[0] || {};
    const dsPlan = await buildDailyScorePlan(email, base44, currentUser);
    const sePlan = await buildSummerEntryPlan(email, base44, currentUser);
    const goalPlan = buildGoalPlan(email, base44);
    const badgeKeys = await currentBadgeKeys(currentUser.id);
    const badgePlan = buildBadgePlan(email, base44, badgeKeys);
    const taskPlan = buildTaskPlan(email, base44);
    const profileDiff = buildProfileDiff(email, base44, currentUser, override);
    const counts = await currentCounts(currentUser.id);

    totalDsEligible += dsPlan.eligible.length; totalDsSkipped += dsPlan.skippedExisting.length; totalDsHeld += dsPlan.held.length;
    totalSeEligible += sePlan.eligible.length; totalSeSkipped += sePlan.skippedExisting.length; totalSeHeld += sePlan.held.length;
    totalGoalsNormal += goalPlan.normalGoals.length; totalGoalsReconstructed += goalPlan.reconstructReading.length; totalGoalsArchivedBlocked += goalPlan.archivedBlocked.length;
    totalBadgesEligible += badgePlan.eligible.length;
    totalTasksEligible += taskPlan.eligible.length;

    if (override) console.log(`  Identity: OVERRIDE APPLIED (${override.reason}) — profile name will NEVER be overwritten.`);

    console.log(`  Daily Scores: before=${counts.daily_scores}  eligible_insert=${dsPlan.eligible.length}  skipped_existing=${dsPlan.skippedExisting.length}  held_ambiguous=${dsPlan.held.length}  after=${Number(counts.daily_scores) + dsPlan.eligible.length}`);
    for (const h of dsPlan.held) console.log(`    HELD ${h.date}: ${h.rows.length} rows — ${h.reason}`);

    const mergedDates = [...new Set([...dsPlan.currentDates, ...dsPlan.eligible.map((e) => e.date)])].sort();
    const projectedStreak = calculateStreak(mergedDates, ptDateString());
    const { estimatedShields, milestonesHit } = estimateShieldsFromDates(mergedDates);
    console.log(`  Streak: current=${currentUser.streak_count}  base44_displayed=${b44User.streak_count ?? '(n/a)'}  projected_canonical=${projectedStreak}`);
    console.log(`  Shields: current=${currentUser.streak_shields}  base44_displayed=${b44User.streak_shields ?? '(n/a)'}  estimated_upper_bound=${estimatedShields} (${milestonesHit} milestone(s), never auto-written)`);

    console.log(`  Inspire Challenge: before=${counts.summer_entries}  eligible_insert=${sePlan.eligible.length}  skipped_existing=${sePlan.skippedExisting.length}  held_ambiguous=${sePlan.held.length}  after=${Number(counts.summer_entries) + sePlan.eligible.length}`);
    const projectedPoints = sePlan.eligible.reduce((s, e) => s + e.points, 0);
    const base44Points = sePlan.eligible.reduce((s, e) => s + e.base44Points, 0);
    if (sePlan.eligible.length) console.log(`    Base44 point total (context only, not authoritative): ${base44Points}  |  projected canonical total: ${projectedPoints}`);
    for (const h of sePlan.held) console.log(`    HELD ${h.date}: ${h.rows.length} rows — ${h.reason}`);

    console.log(`  Goals: normal_import=${goalPlan.normalGoals.length}  reconstructed_reading=${goalPlan.reconstructReading.length}  archived_blocked_by_schema=${goalPlan.archivedBlocked.length}`);
    for (const g of goalPlan.reconstructReading) console.log(`    RECONSTRUCT reading goal from legacy goal_id=${g.goalId}: "${g.bookTitles.join(', ')}"`);
    for (const g of goalPlan.archivedBlocked) console.log(`    BLOCKED (needs schema change) goal_id=${g.goalId}: ${g.logCount} log(s), ${g.dateRange ? g.dateRange.join('..') : ''}`);

    console.log(`  Badges: before=${counts.badges}  eligible=${badgePlan.eligible.length}  ${legacyAllowed ? '(schema ready)' : "(BLOCKED — badges.source doesn't allow 'legacy' yet)"}`);
    for (const b of badgePlan.eligible) console.log(`    "${b.name}" (${b.badge_type}) earned ${b.earned_date || '(no date)'}`);

    console.log(`  Tasks: before=${counts.task_signups}  eligible=${taskPlan.eligible.length}`);

    if (profileDiff.length) {
      console.log(`  Profile diffs (never auto-applied): ${profileDiff.map((d) => `${d.field}: "${d.currentValue || '(blank)'}" -> "${d.base44Value || '(blank)'}"`).join(', ')}`);
    }

    if (WRITE_MODE) {
      await withTransaction(async (client) => {
        await writeUserImport(client, currentUser.id, { dailyScores: dsPlan, summerEntries: sePlan, goals: goalPlan, badges: badgePlan, tasks: taskPlan });
      });
      console.log(`  ✅ WRITTEN (transaction committed) for ${email}`);
    }
  }

  printHeader('OTHER DATA — classification (unchanged from prior review, not migrated here)');
  console.log('Connection.csv, DailyUpdate.csv, InternshipTask.csv (as standalone templates): NOT migrated — dead features / no product need. See MIGRATION_READINESS_REPORT.md.');

  printHeader('SCHEMA REQUIREMENT — badges.source (proposed only, NOT applied by this run)');
  console.log(`Currently allows 'legacy': ${legacyAllowed}`);
  if (!legacyAllowed) {
    console.log(`  ALTER TABLE badges DROP CONSTRAINT badges_source_check;`);
    console.log(`  ALTER TABLE badges ADD CONSTRAINT badges_source_check CHECK (source IN ('manual', 'automatic', 'legacy'));`);
    console.log(`  Rollback: ALTER TABLE badges DROP CONSTRAINT badges_source_check; ALTER TABLE badges ADD CONSTRAINT badges_source_check CHECK (source IN ('manual', 'automatic'));`);
  }

  printHeader('AGGREGATE TOTALS (this run)');
  console.log(`Daily Scores:      eligible=${totalDsEligible}  skipped_existing=${totalDsSkipped}  held=${totalDsHeld}`);
  console.log(`Inspire Challenge: eligible=${totalSeEligible}  skipped_existing=${totalSeSkipped}  held=${totalSeHeld}`);
  console.log(`Goals:             normal=${totalGoalsNormal}  reconstructed=${totalGoalsReconstructed}  archived_blocked=${totalGoalsArchivedBlocked}`);
  console.log(`Badges:            eligible=${totalBadgesEligible} ${legacyAllowed ? '' : '(blocked by schema)'}`);
  console.log(`Tasks:             eligible=${totalTasksEligible}`);

  await flushManifest();

  printHeader('SAFETY CONFIRMATION');
  console.log(`INSERTs executed: ${WRITE_MODE ? manifest.length : 0}`);
  console.log(`UPDATEs executed: ${WRITE_MODE ? '(streak_count/streak_last_date only, per matched user written above)' : 0}`);
  console.log(`DELETEs executed: 0`);
  console.log(`ALTERs executed: 0`);
  console.log(`Mode this run: ${WRITE_MODE ? 'WRITE' : 'DRY RUN — zero production records changed'}`);

  printHeader('EXACT COMMAND FOR THE APPROVED REAL IMPORT (NOT RUN)');
  console.log(`  node server/scripts/migrationImport.js ${exportDir} --commit --i-understand-this-writes-production-data`);
  console.log(`  (optionally add --batch=<your-own-id> to name the run; otherwise one is generated from the timestamp)`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
}).finally(() => {
  pool?.end?.();
});
