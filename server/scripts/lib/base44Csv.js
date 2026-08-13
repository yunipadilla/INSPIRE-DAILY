/**
 * Shared Base44 CSV parsing/mapping utilities.
 *
 * Extracted from migrationDryRun.js so migrationDryRun.js and
 * migrationImport.js share one implementation instead of drifting apart.
 * Nothing in this file touches the database or the filesystem beyond
 * reading the export files handed to it.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { calculateStreak, STREAK_CONSTANTS } from '../../src/lib/streakEngine.js';
import { ptDayOfWeek } from '../../src/config/pacificTime.js';

// ─── Generic helpers ─────────────────────────────────────────────────────────

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Tri-state boolean: 'true'/'false' strings from CSV, or null when blank —
 * blank must never be silently treated as false, since several SummerEntry
 * fields were only added partway through Base44's history. */
export function toBoolOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

export function toNumOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function safeTimeMs(dateStr) {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t : 0;
}

// ─── Minimal RFC4180 CSV parser (no dependency) ─────────────────────────────
// Handles quoted fields containing commas, newlines, and doubled ("") quotes —
// required because real Base44 exports embed multi-line free-text (Daily
// Scores "challenges", GoalLog "note", etc.) inside quoted CSV fields. A naive
// line-split undercounts rows.

export function parseCsvRows(text) {
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
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function csvToObjects(text) {
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

export async function loadEntity(exportDir, baseName) {
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
 * (neither entity has its own `user_email` column); every other entity has an
 * explicit `user_email` (or `email` for User rows). */
export function identityEmailFor(row) {
  if (row.user_email) return normalizeEmail(row.user_email);
  if (row.email) return normalizeEmail(row.email);
  if (row.created_by) return normalizeEmail(row.created_by);
  return null;
}

export function groupByEmail(rows) {
  const map = new Map();
  for (const row of rows) {
    const email = identityEmailFor(row);
    if (!email) continue;
    if (!map.has(email)) map.set(email, []);
    map.get(email).push(row);
  }
  return map;
}

export async function loadBase44Export(exportDir) {
  const [
    users, dailyScores, summerEntries, goals, goalBooks, goalLogs,
    badges, taskSignups, internshipTasks, connections, dailyUpdates, signupRecords,
  ] = await Promise.all([
    loadEntity(exportDir, 'User'),
    loadEntity(exportDir, 'DailyScore'),
    loadEntity(exportDir, 'SummerEntry'),
    loadEntity(exportDir, 'Goal'),
    loadEntity(exportDir, 'GoalBook'),
    loadEntity(exportDir, 'GoalLog'),
    loadEntity(exportDir, 'Badge'),
    loadEntity(exportDir, 'TaskSignup'),
    loadEntity(exportDir, 'InternshipTask'),
    loadEntity(exportDir, 'Connection'),
    loadEntity(exportDir, 'DailyUpdate'),
    loadEntity(exportDir, 'SignupRecord'),
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

// ─── Duplicate (user + date) grouping — DailyScore / SummerEntry ───────────

export function buildDateGroups(rowsByEmail, dateField = 'date') {
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

export function pickRecommendedWinner(rows) {
  return [...rows].sort((a, b) => {
    const tb = safeTimeMs(b.updated_date) - safeTimeMs(a.updated_date);
    if (tb !== 0) return tb;
    const cb = safeTimeMs(b.created_date) - safeTimeMs(a.created_date);
    if (cb !== 0) return cb;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

export function pickOldest(rows) {
  return [...rows].sort((a, b) => {
    const ta = safeTimeMs(a.updated_date) - safeTimeMs(b.updated_date);
    if (ta !== 0) return ta;
    const ca = safeTimeMs(a.created_date) - safeTimeMs(b.created_date);
    if (ca !== 0) return ca;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

export function analyzeDuplicates(byEmailByDate, compareFields) {
  const autoMergeGroups = [];
  const conflictGroups = [];
  for (const [email, byDate] of byEmailByDate) {
    for (const [date, rows] of byDate) {
      if (rows.length < 2) continue;
      const signature = (r) => compareFields.map((f) => r[f]).join('');
      const distinctSignatures = new Set(rows.map(signature));
      const winner = pickRecommendedWinner(rows);
      const group = { email, date, count: rows.length, rows, recommendedWinnerId: winner.id };
      if (distinctSignatures.size === 1) autoMergeGroups.push(group);
      else conflictGroups.push(group);
    }
  }
  return { autoMergeGroups, conflictGroups };
}

export const DAILY_SCORE_COMPARE_FIELDS = [
  'sleep', 'challenges', 'earned_way', 'happiness', 'grit', 'ceo_mindset',
  'goals_worked_on', 'volunteer_hours', 'best_self', 'points',
];
export const SUMMER_ENTRY_COMPARE_FIELDS = [
  'sleep_bed_before_10', 'sleep_hours', 'hydration', 'exercise', 'screen_time',
  'mindfulness', 'mindfulness_sessions', 'reading_sessions', 'cold_plunge',
  'healthy_meal', 'journaling', 'phone_time_under_2h', 'volunteer_hours', 'total_points',
];
// Category-fact fields only (excludes total_points, which is never authoritative
// and is always recomputed) — used to tell a "real" conflict apart from a
// group that only disagrees on Base44's own untrusted point total.
export const SUMMER_ENTRY_CATEGORY_FIELDS = SUMMER_ENTRY_COMPARE_FIELDS.filter((f) => f !== 'total_points');

// ─── SummerEntry (Inspire Challenge) field mapping ──────────────────────────
// See migrationDryRun.js header / Migration Readiness Report §13 for the full
// rationale (confirmed schema drift mid-program between an older and newer
// Base44 field set).

export function mapSummerEntryClean(row) {
  const mapped = {};
  const unmapped = [];
  const ambiguous = [];

  mapped.hydration = toBoolOrNull(row.hydration) ?? false;
  mapped.exercise = toBoolOrNull(row.exercise) ?? false;

  const sleepBedBefore10 = toBoolOrNull(row.sleep_bed_before_10);
  if (sleepBedBefore10 !== null) mapped.sleepBedBefore10 = sleepBedBefore10;
  else { mapped.sleepBedBefore10 = false; unmapped.push('sleepBedBefore10'); }

  const mindfulnessSessions = toNumOrNull(row.mindfulness_sessions);
  if (mindfulnessSessions !== null) mapped.mindfulnessSessions = mindfulnessSessions;
  else { mapped.mindfulnessSessions = 0; unmapped.push('mindfulnessSessions'); }

  const readingSessions = toNumOrNull(row.reading_sessions);
  if (readingSessions !== null) mapped.readingSessions = readingSessions;
  else { mapped.readingSessions = 0; unmapped.push('readingSessions'); }

  const coldPlunge = (row.cold_plunge || '').trim().toLowerCase();
  if (['plunge', 'shower', 'none'].includes(coldPlunge)) mapped.coldPlungeType = coldPlunge;
  else { mapped.coldPlungeType = null; unmapped.push('coldPlungeType'); }

  ambiguous.push({ field: 'sleep8h', candidateValue: row.sleep_hours === '8', basis: `sleep_hours='${row.sleep_hours}'` });
  ambiguous.push({ field: 'nutrition', candidateValue: toBoolOrNull(row.healthy_meal), basis: `healthy_meal=${row.healthy_meal}` });
  ambiguous.push({ field: 'screenTimeTier', candidateValue: toNumOrNull(row.screen_time), basis: `screen_time=${row.screen_time} (0-4 scale, rebuilt is 0-3)` });
  mapped.screenTimeTier = 0;
  mapped.nutrition = false;
  mapped.dailyUpdateSent = false;

  return { mapped, unmapped, ambiguous };
}

// ─── Canonical shield reconstruction (best-effort, explicitly an estimate) ──

export function estimateShieldsFromDates(sortedAscDates) {
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

export function analyzeGoalOrphans(goalsByEmail, goalBooksByEmail, goalLogsByEmail) {
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
        recommendation = 'RECONSTRUCT';
      } else {
        if (logTypes.includes('session')) inferredType = 'meditation or learning (ambiguous)';
        else if (logTypes.includes('progress')) inferredType = 'custom or fitness_weekly (ambiguous)';
        else if (logTypes.includes('completed')) inferredType = 'fitness_daily or custom (ambiguous)';
        confidence = 'low — inferred from log_type/value shape only';
        recommendation = 'ARCHIVE';
      }
      orphanGroups.push({
        goalId, email,
        bookCount: gBooks.length, logCount: gLogs.length,
        books: gBooks, logs: gLogs,
        bookTitles: gBooks.map((b) => b.title).filter(Boolean),
        dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
        logTypes, inferredType, confidence, recommendation,
      });
    }
    results.push({ email, orphanGroupCount: orphanGroups.length, orphanGroups });
  }
  return results;
}

// ─── SignupRecord anomaly scan (supporting evidence only — never primary) ──

export function analyzeSignupRecordAnomalies(signupRecordsByEmail, base44UserEmails) {
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
          ? 'these records disagree on full_name under the same email — evidence this signup source is unreliable for identity'
          : 'duplicate submissions, same apparent name',
      });
    }
    if (!base44UserEmails.has(email)) notInUserTable.push({ email, count: rows.length, sampleFullName: rows[0]?.full_name });
    if (!malformedEmailPattern.test(email)) malformed.push(email);
  }
  return { duplicateEmails, notInUserTable, malformed };
}
