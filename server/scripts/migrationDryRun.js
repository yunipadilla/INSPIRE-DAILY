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
 * Shared parsing/mapping logic lives in ./lib/base44Csv.js — migrationImport.js
 * (the actual, still dry-run-by-default, importer) uses the same module so
 * the two tools can't silently drift apart on what counts as a duplicate,
 * an orphan, or a clean field mapping.
 *
 * Usage:
 *   node server/scripts/migrationDryRun.js <path-to-base44-export-dir> [--email=someone@example.org]
 *
 * Expected export directory layout — CSV is the primary, expected format
 * (this matches Base44's own per-entity dashboard export). Each file is
 * optional; missing = empty. A same-named `.json` file (array of objects) is
 * accepted as a fallback for anyone still using the older synthetic-test
 * layout, but CSV is what real Base44 exports actually produce.
 *
 *   User.csv, DailyScore.csv, SummerEntry.csv, Goal.csv, GoalBook.csv,
 *   GoalLog.csv, Badge.csv, TaskSignup.csv, InternshipTask.csv,
 *   Connection.csv, DailyUpdate.csv, SignupRecord.csv (supporting evidence
 *   only — never the primary identity source, see below).
 *
 * NOTHING here calls insert/update/delete/alter. This tool may only run
 * SELECT statements against the live database.
 */

import { query, pool } from '../src/db.js';
import { calculateStreak, STREAK_CONSTANTS } from '../src/lib/streakEngine.js';
import { calculateSummerPoints } from '../src/lib/summerChallenge.js';
import { ptDateString } from '../src/config/pacificTime.js';
import {
  normalizeEmail, normalizeName, toNumOrNull,
  loadBase44Export, buildDateGroups, pickRecommendedWinner, analyzeDuplicates,
  DAILY_SCORE_COMPARE_FIELDS, SUMMER_ENTRY_COMPARE_FIELDS, mapSummerEntryClean,
  estimateShieldsFromDates, analyzeGoalOrphans, analyzeSignupRecordAnomalies,
} from './lib/base44Csv.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const exportDir = process.argv[2];
const onlyEmailArg = process.argv.find((a) => a.startsWith('--email='));
const onlyEmail = onlyEmailArg ? normalizeEmail(onlyEmailArg.slice('--email='.length)) : null;

if (!exportDir) {
  console.error('Usage: node server/scripts/migrationDryRun.js <path-to-base44-export-dir> [--email=someone@example.org]');
  process.exit(1);
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

  const b44DateGroups = dsGroups.get(email) || new Map();
  const b44UniqueDates = [...b44DateGroups.keys()].sort();
  const dupDatesForUser = [...b44DateGroups.entries()].filter(([, rows]) => rows.length > 1).map(([d]) => d);
  const missingFromCurrent = b44UniqueDates.filter((d) => !currentDates.includes(d));
  const conflictingWithCurrent = b44UniqueDates.filter((d) => currentDates.includes(d));

  const mergedDates = [...new Set([...currentDates, ...missingFromCurrent])].sort();
  const todayStr = ptDateString();
  const recalculatedStreak = calculateStreak(mergedDates, todayStr);
  const { estimatedShields, milestonesHit } = estimateShieldsFromDates(mergedDates);

  const seDateGroups = seGroups.get(email) || new Map();
  const seUniqueDates = [...seDateGroups.keys()].sort();
  const seDupDates = [...seDateGroups.entries()].filter(([, rows]) => rows.length > 1).map(([d]) => d);
  const seMissingFromCurrent = seUniqueDates.filter((d) => !currentSummerDates.includes(d));
  let projectedPointsTotal = 0;
  let base44PointsTotal = 0;
  const unmappedFieldNotes = new Set();
  for (const date of seMissingFromCurrent) {
    const rows = seDateGroups.get(date);
    const row = pickRecommendedWinner(rows);
    base44PointsTotal += toNumOrNull(row.total_points) || 0;
    const { mapped, unmapped } = mapSummerEntryClean(row);
    projectedPointsTotal += calculateSummerPoints(mapped);
    unmapped.forEach((u) => unmappedFieldNotes.add(u));
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
    console.log(`    ⚠ Discrepancy vs Base44's displayed value — DO NOT overwrite with Base44's number. Trust the`);
    console.log(`      canonical recalculation above once history is imported; escalate to a human only if the gap is large and unexplained.`);
  } else {
    console.log(`    ✓ Canonical recalculation matches Base44's displayed streak.`);
  }

  console.log(`  Shields:`);
  console.log(`    Base44 displayed streak_shields: ${b44User.streak_shields ?? '(not present)'}`);
  console.log(`    Current Inspire streak_shields:  ${currentUserRow.streak_shields}`);
  console.log(`    Estimated upper bound from merged history: ${estimatedShields} (${milestonesHit} 7-day milestone(s), capped at ${STREAK_CONSTANTS.MAX_SHIELDS})`);
  console.log(`    ⚠ Shield CONSUMPTION is not a recorded fact in either schema — this is an upper bound only, never ground truth.`);

  console.log(`  Inspire Challenge (SummerEntry):`);
  console.log(`    Base44 raw rows: ${b44Summer.length} | unique dates: ${seUniqueDates.length} | duplicate-date groups: ${seDupDates.length}`);
  console.log(`    Current rebuilt entries: ${currentCountsRow.summer_entries}`);
  console.log(`    Proposed import: ${seMissingFromCurrent.length} missing historical date(s)`);
  if (seMissingFromCurrent.length) {
    console.log(`    Base44 historical point total (NOT authoritative, shown for context only): ${base44PointsTotal}`);
    console.log(`    Projected canonical rebuilt point total (recomputed via calculateSummerPoints, clean+era-gated fields only): ${projectedPointsTotal}`);
  }
  if (seDupDates.length) {
    console.log(`    ⚠ ${seDupDates.length} date(s) have duplicate Base44 rows — see "Global Data Problems" for per-row detail.`);
  }

  console.log(`  Goals: Base44 ${b44Goals.length} (+ ${b44Books.length} books, ${b44Logs.length} logs) vs current ${currentCountsRow.goals} (+ ${currentCountsRow.goal_books} books, ${currentCountsRow.goal_logs} logs)`);
  console.log(`  Tasks (TaskSignup): Base44 ${b44Tasks.length} vs current ${currentCountsRow.task_signups}`);
  console.log(`  Badges: Base44 ${b44Badges.length} vs current ${currentCountsRow.badges}`);
  console.log(`    Proposed: import ${newBadges.length} legitimate historical badge award(s) as source='legacy' (requires the schema change below first)`);
  for (const b of newBadges.slice(0, 10)) {
    console.log(`      - [${b.badge_type}] "${b.name}" earned ${b.earned_date || '(no date)'}${b.trigger_key ? ` (trigger: ${b.trigger_key})` : ''}`);
  }
  if (newBadges.length > 10) console.log(`      … and ${newBadges.length - 10} more`);

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
  const base44 = await loadBase44Export(exportDir);
  const r = base44.raw;

  printHeader('DATASET SUMMARY (parsed from real CSV export — RFC4180-aware, quoted multi-line fields handled)');
  const dateRange = (rows, field = 'date') => {
    const dates = rows.map((row) => row[field]).filter(Boolean).sort();
    return dates.length ? `${dates[0]} .. ${dates[dates.length - 1]}` : '(no dates)';
  };
  console.log(`Export directory: ${exportDir}`);
  const summaryRows = [
    ['User', r.users.length, '—'], ['DailyScore', r.dailyScores.length, dateRange(r.dailyScores)],
    ['SummerEntry', r.summerEntries.length, dateRange(r.summerEntries)], ['Goal', r.goals.length, '—'],
    ['GoalBook', r.goalBooks.length, '—'], ['GoalLog', r.goalLogs.length, dateRange(r.goalLogs)],
    ['Badge', r.badges.length, dateRange(r.badges, 'earned_date')], ['TaskSignup', r.taskSignups.length, '—'],
    ['InternshipTask', r.internshipTasks.length, '—'], ['Connection', r.connections.length, '—'],
    ['DailyUpdate', r.dailyUpdates.length, dateRange(r.dailyUpdates)], ['SignupRecord', r.signupRecords.length, '—'],
  ];
  for (const [name, count, range] of summaryRows) {
    console.log(`  ${name.padEnd(16)} ${String(count).padStart(4)} rows   ${range}`);
  }

  const allEmails = new Set([
    ...base44.usersByEmail.keys(), ...base44.dailyScoresByEmail.keys(), ...base44.summerEntriesByEmail.keys(),
    ...base44.goalsByEmail.keys(), ...base44.badgesByEmail.keys(), ...base44.taskSignupsByEmail.keys(),
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
  }
  console.log(`  ${signupAnomalies.notInUserTable.length} SignupRecord email(s) absent from the Base44 User table entirely.`);

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
      console.log(`  ${c.email}: Base44 name "${c.base44Name}" vs current account name "${c.currentName}" (matched by email only per policy).`);
    }
  }

  printHeader('GLOBAL DATA PROBLEMS');
  const dsGroupsAll = buildDateGroups(base44.dailyScoresByEmail);
  const dsDupes = analyzeDuplicates(dsGroupsAll, DAILY_SCORE_COMPARE_FIELDS);
  console.log(`\nDaily Scores duplicate (email,date) groups: ${dsDupes.autoMergeGroups.length + dsDupes.conflictGroups.length} total (${dsDupes.autoMergeGroups.length} auto-mergeable, ${dsDupes.conflictGroups.length} conflicting)`);
  for (const g of dsDupes.conflictGroups) {
    console.log(`  [${g.email} @ ${g.date}] ${g.count} rows — recommended winner: ${g.recommendedWinnerId} — UNRESOLVED, needs sign-off.`);
  }

  const seGroupsAll = buildDateGroups(base44.summerEntriesByEmail);
  const seDupes = analyzeDuplicates(seGroupsAll, SUMMER_ENTRY_COMPARE_FIELDS);
  console.log(`\nSummerEntry duplicate (email,date) groups: ${seDupes.autoMergeGroups.length + seDupes.conflictGroups.length} total (${seDupes.autoMergeGroups.length} auto-mergeable, ${seDupes.conflictGroups.length} conflicting)`);
  for (const g of seDupes.conflictGroups) {
    console.log(`  [${g.email} @ ${g.date}] ${g.count} rows, total_points=[${g.rows.map((r) => r.total_points).join(', ')}], recommended winner=${g.recommendedWinnerId} — UNRESOLVED, needs sign-off.`);
  }

  const goalOrphans = analyzeGoalOrphans(base44.goalsByEmail, base44.goalBooksByEmail, base44.goalLogsByEmail);
  const totalOrphanGroups = goalOrphans.reduce((sum, u) => sum + u.orphanGroupCount, 0);
  console.log(`\nOrphan Goal references: ${totalOrphanGroups} distinct orphan goal(s) across ${goalOrphans.length} user(s)`);
  for (const u of goalOrphans) {
    for (const g of u.orphanGroups) {
      console.log(`  [${g.email}] goal_id=${g.goalId} — ${g.bookCount} book(s), ${g.logCount} log(s), inferred: ${g.inferredType || '(no signal)'} -> ${g.recommendation}`);
    }
  }

  printHeader('SCHEMA REQUIREMENTS — proposed only, NOT applied');
  const constraint = await getBadgesSourceConstraint();
  const liveBadgeRowCount = await countBadgeRows();
  console.log(`\nCurrent live constraint: ${constraint ? `${constraint.conname}: ${constraint.def}` : '(not found)'}`);
  console.log(`Current badges row count: ${liveBadgeRowCount}`);
  console.log(`Proposed: ALTER TABLE badges DROP CONSTRAINT badges_source_check; ALTER TABLE badges ADD CONSTRAINT badges_source_check CHECK (source IN ('manual', 'automatic', 'legacy'));`);
  console.log(`Rollback: ALTER TABLE badges DROP CONSTRAINT badges_source_check; ALTER TABLE badges ADD CONSTRAINT badges_source_check CHECK (source IN ('manual', 'automatic'));`);

  const liveInternshipTaskCount = await countInternshipTasks();
  console.log(`\nInternshipTask.csv: ${r.internshipTasks.length} row(s); live internship_tasks: ${liveInternshipTaskCount} row(s) — optional, not part of history migration.`);

  printHeader('END OF DRY-RUN — no writes were performed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Dry-run failed:', err);
  process.exit(1);
}).finally(() => {
  pool?.end?.();
});
