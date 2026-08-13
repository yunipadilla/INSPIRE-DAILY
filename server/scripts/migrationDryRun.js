#!/usr/bin/env node
/**
 * Base44 → Inspire Daily reconciliation DRY-RUN tool.
 *
 * READ-ONLY. This script never writes to the database and never writes to
 * the Base44 export files it reads. It exists purely to answer: "if we were
 * to migrate this person's history, what would change, and does the
 * canonical rebuilt engine reproduce what Base44 displayed?"
 *
 * Usage:
 *   node server/scripts/migrationDryRun.js <path-to-base44-export-dir> [--email=someone@example.org]
 *
 * Expected export directory layout (each file optional; missing = empty):
 *   User.json         — array of Base44 User rows (id, email, full_name, app_role,
 *                        streak_count, streak_shields, streak_last_date, ...)
 *   DailyScore.json    — array of Base44 DailyScore rows (created_by [email],
 *                        intern_name, date, points, best_self, ceo_mindset, ...)
 *   SummerEntry.json   — array of Base44 SummerEntry rows (created_by [email],
 *                        intern_name, date, total_points, ...)
 *   Goal.json          — array of Base44 Goal rows (user_email, type, name, ...)
 *   GoalBook.json      — array of Base44 GoalBook rows (user_email, goal_id, ...)
 *   GoalLog.json       — array of Base44 GoalLog rows (user_email, goal_id, date, ...)
 *   Badge.json         — array of Base44 Badge rows (user_email, badge_type, name,
 *                        earned_date, trigger_key, ...)
 *   TaskSignup.json    — array of Base44 TaskSignup rows (user_email, task_title,
 *                        status, hours_spent, ...)
 *
 * This matches Base44's per-entity export shape. If your export is CSV
 * instead of JSON, convert each file to a JSON array first — this script
 * intentionally does not guess at CSV column typing.
 *
 * NOTHING here calls insert/update/delete. Every database call in this file
 * is a `select`. Grep for "query(" below to verify.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { query } from '../src/db.js';
import { calculateStreak, STREAK_CONSTANTS } from '../src/lib/streakEngine.js';
import { ptDayOfWeek, ptDateString } from '../src/config/pacificTime.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const exportDir = process.argv[2];
const onlyEmailArg = process.argv.find((a) => a.startsWith('--email='));
const onlyEmail = onlyEmailArg ? normalizeEmail(onlyEmailArg.slice('--email='.length)) : null;

if (!exportDir) {
  console.error('Usage: node server/scripts/migrationDryRun.js <path-to-base44-export-dir> [--email=someone@example.org]');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function loadEntity(fileName) {
  try {
    const raw = await readFile(path.join(exportDir, fileName), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`Failed to parse ${fileName}: ${err.message}`);
  }
}

/** Base44 DailyScore/SummerEntry rows carry the creator's email in `created_by`
 * (confirmed against the legacy export's own repair scripts), falling back to
 * `intern_name` only where `created_by` is missing — a known legacy data-
 * quality gap, not something to silently paper over here. */
function identityEmailFor(row) {
  if (row.user_email) return normalizeEmail(row.user_email);
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
  const [users, dailyScores, summerEntries, goals, goalBooks, goalLogs, badges, taskSignups] = await Promise.all([
    loadEntity('User.json'),
    loadEntity('DailyScore.json'),
    loadEntity('SummerEntry.json'),
    loadEntity('Goal.json'),
    loadEntity('GoalBook.json'),
    loadEntity('GoalLog.json'),
    loadEntity('Badge.json'),
    loadEntity('TaskSignup.json'),
  ]);

  return {
    usersByEmail: groupByEmail(users.map((u) => ({ ...u, user_email: u.email }))),
    dailyScoresByEmail: groupByEmail(dailyScores),
    summerEntriesByEmail: groupByEmail(summerEntries),
    goalsByEmail: groupByEmail(goals),
    goalBooksByEmail: groupByEmail(goalBooks),
    goalLogsByEmail: groupByEmail(goalLogs),
    badgesByEmail: groupByEmail(badges),
    taskSignupsByEmail: groupByEmail(taskSignups),
  };
}

// ─── Read current Inspire Daily state (SELECT-only) ─────────────────────────

async function findCurrentUserByEmail(email) {
  const { rows } = await query(
    `select id, email, first_name, last_name, birthday, app_role, system_role, account_status,
            streak_count, streak_shields, streak_last_date, created_at
     from users where lower(email) = lower($1)`,
    [email]
  );
  return rows;
}

async function currentDailyScoreDates(userId) {
  const { rows } = await query(
    `select date::text as date from daily_scores where user_id = $1 order by date asc`,
    [userId]
  );
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
  const { rows } = await query(
    `select badge_type, name from badges where user_id = $1`,
    [userId]
  );
  return new Set(rows.map((r) => `${r.badge_type}::${r.name}`));
}

// ─── Canonical shield reconstruction (best-effort, explicitly an estimate) ──
//
// Shields are awarded going FORWARD in time, the instant a streak first
// crosses a multiple of 7 (capped at STREAK_CONSTANTS.MAX_SHIELDS), and are
// CONSUMED by a separate event (missing a required day with no submission)
// that is not itself recorded as a queryable historical fact in either the
// Base44 or rebuilt schema. That means: replaying submission dates forward
// can reconstruct an *upper bound* on shields earned, but can never
// reconstruct consumption history that isn't in the DailyScore dates
// themselves. This function returns that upper bound, clearly labeled as an
// estimate — never as ground truth.
function estimateShieldsFromDates(sortedAscDates) {
  let shields = 0;
  let milestonesHit = 0;
  const seen = new Set();
  for (const date of sortedAscDates) {
    if (ptDayOfWeek(date) === 0) continue; // Sunday never counts
    seen.add(date);
    const streakSoFar = calculateStreak([...seen], date);
    if (streakSoFar > 0 && streakSoFar % STREAK_CONSTANTS.SHIELD_INTERVAL_DAYS === 0) {
      milestonesHit += 1;
    }
  }
  shields = Math.min(milestonesHit, STREAK_CONSTANTS.MAX_SHIELDS);
  return { estimatedShields: shields, milestonesHit };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printHeader(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

async function reportMatchedUser(email, base44, currentUserRow) {
  const b44User = (base44.usersByEmail.get(email) || [])[0] || {};
  const b44Scores = base44.dailyScoresByEmail.get(email) || [];
  const b44Summer = base44.summerEntriesByEmail.get(email) || [];
  const b44Goals = base44.goalsByEmail.get(email) || [];
  const b44Books = base44.goalBooksByEmail.get(email) || [];
  const b44Logs = base44.goalLogsByEmail.get(email) || [];
  const b44Badges = base44.badgesByEmail.get(email) || [];
  const b44Tasks = base44.taskSignupsByEmail.get(email) || [];

  const currentDates = await currentDailyScoreDates(currentUserRow.id);
  const currentCountsRow = await currentCounts(currentUserRow.id);
  const currentBadgeKeySet = await currentBadgeKeys(currentUserRow.id);

  const b44Dates = [...new Set(b44Scores.map((s) => s.date).filter(Boolean))];
  const mergedDates = [...new Set([...currentDates, ...b44Dates])].sort();
  const missingFromCurrent = b44Dates.filter((d) => !currentDates.includes(d));

  const todayStr = ptDateString();
  const recalculatedStreak = calculateStreak(mergedDates, todayStr);
  const { estimatedShields, milestonesHit } = estimateShieldsFromDates(mergedDates);

  const newBadges = b44Badges.filter((b) => !currentBadgeKeySet.has(`${b.badge_type}::${b.name}`));

  console.log(`\nUser: ${email}`);
  console.log(`  Identity: Base44 "${b44User.full_name || '(unknown)'}" ↔ current "${currentUserRow.first_name} ${currentUserRow.last_name}"`);
  if (b44User.full_name && `${currentUserRow.first_name} ${currentUserRow.last_name}`.toLowerCase() !== String(b44User.full_name).toLowerCase()) {
    console.log(`  ⚠ Name differs — review before importing (Base44: "${b44User.full_name}", current: "${currentUserRow.first_name} ${currentUserRow.last_name}")`);
  }

  console.log(`  Daily Scores:`);
  console.log(`    Base44 historical submissions: ${b44Dates.length}`);
  console.log(`    Current Inspire submissions:   ${currentCountsRow.daily_scores}`);
  console.log(`    Proposed: import ${missingFromCurrent.length} missing historical submission date(s)${missingFromCurrent.length ? ' (' + missingFromCurrent.slice(0, 5).join(', ') + (missingFromCurrent.length > 5 ? ', …' : '') + ')' : ''}`);

  console.log(`  Streak:`);
  console.log(`    Base44 displayed streak_count:      ${b44User.streak_count ?? '(not present in export)'}`);
  console.log(`    Current Inspire streak_count:        ${currentUserRow.streak_count}`);
  console.log(`    Canonical streak from merged history: ${recalculatedStreak}`);
  if (b44User.streak_count !== undefined && Number(b44User.streak_count) !== recalculatedStreak) {
    console.log(`    ⚠ Discrepancy vs Base44's displayed value — do NOT overwrite with Base44's number.`);
    console.log(`      Likely cause: Base44 ran ${'>'}1 divergent streak implementation over its lifetime (documented,`);
    console.log(`      see midnightStreakReset / fixAllStreaks / fixSundayStreaks / streakAudit in the export) that`);
    console.log(`      drifted out of sync with the underlying DailyScore history. The canonical rebuilt value above,`);
    console.log(`      recalculated from the same underlying dates, is the value to trust once history is imported.`);
    console.log(`    Recommended resolution: import the missing dates, then trust the canonical recalculation —`);
    console.log(`      flag this user for a human glance only if the gap is large and unexplained.`);
  } else {
    console.log(`    ✓ Canonical recalculation matches Base44's displayed streak.`);
  }

  console.log(`  Shields:`);
  console.log(`    Base44 displayed streak_shields: ${b44User.streak_shields ?? '(not present in export)'}`);
  console.log(`    Current Inspire streak_shields:  ${currentUserRow.streak_shields}`);
  console.log(`    Estimated shields earned from history (upper bound, ignores consumption): ${estimatedShields} (${milestonesHit} 7-day milestone(s) crossed, capped at ${STREAK_CONSTANTS.MAX_SHIELDS})`);
  console.log(`    ⚠ Shield consumption is not a recorded historical fact in either schema — this estimate can`);
  console.log(`      only be an upper bound. Do not set streak_shields from this estimate automatically;`);
  console.log(`      present both numbers to staff and let them decide, or leave shields at the canonical`);
  console.log(`      recalculation's natural value (0) and let normal use re-earn them going forward.`);

  console.log(`  Goals: Base44 ${b44Goals.length} (+ ${b44Books.length} books, ${b44Logs.length} logs) vs current ${currentCountsRow.goals} (+ ${currentCountsRow.goal_books} books, ${currentCountsRow.goal_logs} logs)`);
  console.log(`  Inspire Challenge (SummerEntry): Base44 ${b44Summer.length} historical entries vs current ${currentCountsRow.summer_entries}`);
  if (b44Summer.length) {
    console.log(`    ⚠ Base44's point formula differs materially from the rebuilt Inspire Challenge point formula`);
    console.log(`      (different categories entirely — see Migration Readiness Report §4). Import raw boolean/`);
    console.log(`      numeric facts only where a field maps cleanly; never copy total_points across systems.`);
  }
  console.log(`  Tasks (TaskSignup): Base44 ${b44Tasks.length} vs current ${currentCountsRow.task_signups}`);
  console.log(`  Badges: Base44 ${b44Badges.length} vs current ${currentCountsRow.badges}`);
  console.log(`    Proposed: import ${newBadges.length} legitimate historical badge award(s) as legacy-source records`);
  if (newBadges.length) {
    console.log(`    ⚠ Requires the approved badges.source CHECK constraint widening (see Migration Readiness`);
    console.log(`      Report §9) — 'legacy' is not yet an allowed value. Do not write these with source='manual'`);
    console.log(`      just to work around that; that would fabricate an awarding staff member who doesn't exist.`);
    for (const b of newBadges.slice(0, 10)) {
      console.log(`      - [${b.badge_type}] "${b.name}" earned ${b.earned_date || '(no date)'}${b.trigger_key ? ` (trigger: ${b.trigger_key})` : ''}`);
    }
    if (newBadges.length > 10) console.log(`      … and ${newBadges.length - 10} more`);
  }

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
  console.log(`  Base44 identity: "${b44User.full_name || '(unknown)'}" (${b44User.app_role || 'role unknown'})`);
  if (hasAnyHistory) {
    console.log(`  Historical data available once they sign up: ${counts.dailyScores} Daily Scores, ${counts.summerEntries} Inspire Challenge entries, ${counts.goals} goals, ${counts.badges} badges, ${counts.tasks} task signups.`);
    console.log(`  Per migration policy: do NOT create an account or import anything now. When this email signs up`);
    console.log(`  through the normal flow, Inspire HQ should be able to surface "historical data available" for`);
    console.log(`  staff review — that surfacing is not yet built (see Migration Readiness Report §8/§10).`);
  } else {
    console.log(`  No historical records found for this email in the export — nothing to reconcile.`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const base44 = await loadBase44Export();

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

    const currentRows = await findCurrentUserByEmail(email);
    if (currentRows.length === 0) {
      notYetSignedUp.push(email);
    } else if (currentRows.length > 1) {
      // Should be impossible given the live users_email_key UNIQUE constraint,
      // but checked explicitly rather than assumed — see Migration Readiness
      // Report §11 re: case-sensitivity of that constraint.
      ambiguous.push({ email, reason: `${currentRows.length} current Inspire Daily accounts matched this email — never auto-merge.` });
    } else {
      const currentUser = currentRows[0];
      const b44User = b44UserRows[0];
      if (b44User && b44User.full_name) {
        const currentFullName = `${currentUser.first_name} ${currentUser.last_name}`.trim().toLowerCase();
        const b44FullName = String(b44User.full_name).trim().toLowerCase();
        // Materially different names under an identical email is flagged as a
        // conflict for human review — never silently reconciled.
        if (currentFullName && b44FullName && currentFullName !== b44FullName) {
          conflict.push({ email, base44Name: b44User.full_name, currentName: `${currentUser.first_name} ${currentUser.last_name}` });
          continue;
        }
      }
      matched.push({ email, currentUser });
    }
  }

  printHeader(`BASE44 → INSPIRE DAILY RECONCILIATION DRY-RUN`);
  console.log(`Export directory: ${exportDir}`);
  console.log(`Base44 identities discovered: ${allEmails.size}`);
  console.log(`  MATCHED:            ${matched.length}`);
  console.log(`  NOT_YET_SIGNED_UP:  ${notYetSignedUp.length}`);
  console.log(`  AMBIGUOUS:          ${ambiguous.length}`);
  console.log(`  CONFLICT:           ${conflict.length}`);
  console.log(`NO DATABASE WRITES WILL OCCUR. This tool only runs SELECT queries.`);

  if (matched.length) {
    printHeader('MATCHED — proposed reconciliation preview');
    for (const { email, currentUser } of matched) {
      await reportMatchedUser(email, base44, currentUser);
    }
  }

  if (notYetSignedUp.length) {
    printHeader('NOT YET SIGNED UP — no action taken');
    for (const email of notYetSignedUp) {
      reportNotYetSignedUp(email, base44);
    }
  }

  if (ambiguous.length) {
    printHeader('AMBIGUOUS — requires human review, no action taken');
    for (const a of ambiguous) console.log(`  ${a.email}: ${a.reason}`);
  }

  if (conflict.length) {
    printHeader('CONFLICT — requires human review, no action taken');
    for (const c of conflict) {
      console.log(`  ${c.email}: Base44 name "${c.base44Name}" vs current account name "${c.currentName}"`);
    }
  }

  printHeader('END OF DRY-RUN — no writes were performed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Dry-run failed:', err);
  process.exit(1);
});
