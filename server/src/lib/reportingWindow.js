/**
 * Shared reporting-period helpers — the Daily Scores Summary Agent
 * (services/hq/summaryAgentService.js) and the participant Home "Your Week"
 * block both need the same answer to "how many days were actually eligible
 * in this range" (Sunday is always a rest day and must never count as a
 * missed day; a future date can never count as expected-but-missed either).
 * One implementation here, not two copies drifting apart.
 */
import { ptDayOfWeek, ptDateString, addDays, currentWeekBoundsPT } from '../config/pacificTime.js';

/** Count of non-Sunday days in [start, end], capped so a range extending
 * into the future never counts an unarrived day as "expected." */
export function eligibleDayCount(start, end, today = ptDateString()) {
  const cappedEnd = end > today ? today : end;
  if (cappedEnd < start) return 0;
  let count = 0;
  for (let d = start; d <= cappedEnd; d = addDays(d, 1)) {
    if (ptDayOfWeek(d) !== 0) count += 1;
  }
  return count;
}

/** The Mon-Sun week immediately before the given week's start date. */
export function previousWeekBounds(weekStart) {
  const start = addDays(weekStart, -7);
  const end = addDays(weekStart, -1);
  return { start, end };
}

/** { start, end } of the calendar month immediately before `monthStart`
 * ('YYYY-MM-01'). */
export function previousMonthBounds(monthStart) {
  const [y, m] = monthStart.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const end = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export { currentWeekBoundsPT };
