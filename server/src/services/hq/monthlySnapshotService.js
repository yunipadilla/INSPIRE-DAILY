/**
 * Inspire HQ Monthly Program Snapshot — the reusable service behind the
 * Overview's "Monthly Program Snapshot" section. Composes the two other
 * canonical resolvers (volunteerTimeService, challengeService's monthly
 * breakdown) rather than querying tables directly, so this file never
 * duplicates the double-counting/checkpoint-awareness logic those already
 * solve. Individual Summary Agent reports are a separate concern — this is
 * PROGRAM-WIDE totals only.
 */
import { query } from '../../db.js';
import { resolveVolunteerMinutesForProgram } from '../volunteerTimeService.js';
import { getMonthlyChallengeBreakdown, resolveMonthBounds } from './challengeService.js';
import { getSnapshot, upsertSnapshot } from '../../repositories/hqMonthlySnapshots.js';
import { ptDateString } from '../../config/pacificTime.js';

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isCurrentMonth(year, month) {
  const [curYear, curMonth] = ptDateString().split('-').map(Number);
  return year === curYear && month === curMonth;
}

/** Live-computes program totals + per-participant breakdowns for a given
 * month — the actual source of truth, always internally consistent (the
 * totals are literal sums of the same breakdown rows returned alongside
 * them, never a separately-computed number that could drift). */
export async function computeMonthlySnapshot(year, month) {
  const { start, end } = resolveMonthBounds(monthKey(year, month));

  const [volunteer, challengeBreakdown, participantCountRes] = await Promise.all([
    resolveVolunteerMinutesForProgram(start, end),
    getMonthlyChallengeBreakdown(start, end),
    query(`select id, first_name, last_name from users where system_role = 'participant' and account_status = 'approved'`),
  ]);

  const volunteerBreakdown = participantCountRes.rows
    .map((u) => ({ userId: u.id, firstName: u.first_name, lastName: u.last_name, minutes: volunteer.byUser.get(u.id) || 0 }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const totalChallengePoints = challengeBreakdown.reduce((sum, r) => sum + r.points, 0);
  const challengeDaysLogged = challengeBreakdown.reduce((sum, r) => sum + r.daysLogged, 0);

  return {
    year,
    month,
    period: { start, end },
    totalVolunteerMinutes: volunteer.totalMinutes,
    totalChallengePoints,
    participantCount: participantCountRes.rows.length,
    challengeDaysLogged,
    volunteerBreakdown,
    challengeBreakdown: challengeBreakdown.filter((r) => r.points > 0 || r.daysLogged > 0),
  };
}

/**
 * Loads a month for display. The current month always live-recomputes and
 * silently upserts its own snapshot (it's expected to keep changing as new
 * activity comes in — never frozen prematurely). A past month prefers its
 * saved snapshot's totals — bootstrapping one on first view if none exists
 * yet — but the breakdown is always computed fresh so it's guaranteed to sum
 * to whatever totals are shown; a closed month's underlying data doesn't
 * change on its own, so this is deterministic, not a silent rewrite. Use
 * refreshMonthlySnapshot() for an explicit, authorized historical
 * correction.
 */
export async function loadMonthlySnapshot(year, month) {
  const computed = await computeMonthlySnapshot(year, month);

  if (isCurrentMonth(year, month)) {
    const saved = await upsertSnapshot({
      year, month,
      totalVolunteerMinutes: computed.totalVolunteerMinutes,
      totalChallengePoints: computed.totalChallengePoints,
      participantCount: computed.participantCount,
      challengeDaysLogged: computed.challengeDaysLogged,
    });
    return { ...computed, snapshot: saved };
  }

  let saved = await getSnapshot(year, month);
  if (!saved) {
    saved = await upsertSnapshot({
      year, month,
      totalVolunteerMinutes: computed.totalVolunteerMinutes,
      totalChallengePoints: computed.totalChallengePoints,
      participantCount: computed.participantCount,
      challengeDaysLogged: computed.challengeDaysLogged,
    });
  }
  // Historical totals come from the saved snapshot (not silently rewritten
  // on every view); breakdown stays live so it always sums to what's shown.
  return {
    ...computed,
    totalVolunteerMinutes: saved.total_volunteer_minutes,
    totalChallengePoints: Number(saved.total_challenge_points),
    participantCount: saved.participant_count,
    challengeDaysLogged: saved.challenge_days_logged,
    snapshot: saved,
  };
}

/** Explicit "Refresh Snapshot" action — recomputes and overwrites the saved
 * totals for a (typically historical) month. Never creates a second row for
 * the same (year, month) — UNIQUE(year, month) plus upsertSnapshot's ON
 * CONFLICT make that structurally impossible — and increments
 * source_version so the overwrite is itself auditable. */
export async function refreshMonthlySnapshot(year, month) {
  const computed = await computeMonthlySnapshot(year, month);
  const saved = await upsertSnapshot({
    year, month,
    totalVolunteerMinutes: computed.totalVolunteerMinutes,
    totalChallengePoints: computed.totalChallengePoints,
    participantCount: computed.participantCount,
    challengeDaysLogged: computed.challengeDaysLogged,
  });
  return { ...computed, snapshot: saved };
}
