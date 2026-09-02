import { ptDateString, addDays, ptDayOfWeek } from '../../config/pacificTime.js';

/** Shared by every HQ analytics section so "7/30/90 day window" means the
 * same thing everywhere. Sunday is always excluded from denominators
 * (participation-rate math) since it's a program-wide rest day — never
 * required, never penalized — exactly like the participant-facing rules. */
export function windowBounds(days, todayStr = ptDateString()) {
  return { start: addDays(todayStr, -(days - 1)), end: todayStr, days };
}

/** Count of non-Sunday calendar days in [start, end] inclusive — the correct
 * denominator for a Daily-Scores-style participation rate over a window. */
export function nonRestDayCount(start, end) {
  let count = 0;
  let cur = start;
  while (cur <= end) {
    if (ptDayOfWeek(cur) !== 0) count += 1;
    cur = addDays(cur, 1);
  }
  return count;
}

/**
 * Builds a day-by-day trend series from exactly one aggregate query's rows
 * (grouped by date) merged onto a full day scaffold — never one query per
 * day, and no generate_series column-merging headaches in node-postgres.
 */
export function scaffoldDays(start, end) {
  const days = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

export function mergeIntoScaffold(days, rows, keyField, valueFields, zeroValues) {
  const byDay = new Map(rows.map((r) => [r[keyField], r]));
  return days.map((day) => {
    const row = byDay.get(day);
    const out = { date: day };
    for (const f of valueFields) out[f] = row ? Number(row[f] ?? 0) : (zeroValues?.[f] ?? 0);
    return out;
  });
}

/** Whitelisted appRole filter fragment — never interpolate a raw value. */
export function appRoleClause(appRole, paramIndex) {
  if (!appRole) return { sql: '', params: [] };
  return { sql: ` and u.app_role = $${paramIndex}`, params: [appRole] };
}
