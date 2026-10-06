/**
 * Tier Lab rule definitions — the ONLY place tier thresholds live.
 *
 * Tier Lab is a PRIVATE, PRE-LAUNCH (shadow-mode) staff tool. Nothing here is
 * visible to participants, nothing here awards anything, and nothing here
 * activates by itself on any date. Changing `participantVisible` or
 * `effectiveForOfficialAwards` is a deliberate future implementation
 * decision, not a config tweak — no participant-facing code reads this file.
 *
 * To try different thresholds, add a new version (e.g. `v2`) or use the HQ
 * Rule Simulator (which only previews and never changes this file).
 */

function deepFreeze(o) {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
}

export const TIER_RULE_SETS = deepFreeze({
  v1: {
    version: 'v1',
    label: 'Draft Rules V1',
    status: 'draft',
    participantVisible: false,
    effectiveForOfficialAwards: false,
    // Evaluation window length (calendar months, ending at the selected month).
    windowMonths: 6,
    // Both requirements must be met for a tier; evaluated best tier first.
    tiers: [
      { tier: 1, minCompletion: 0.9, minChallengeAvg: 15 },
      { tier: 2, minCompletion: 0.6, minChallengeAvg: 11 },
      { tier: 3, minCompletion: 0.3, minChallengeAvg: 8 },
    ],
    // Fewer verifiable eligible days than this (for either measure) => the
    // result is "Insufficient Data" instead of a tier — a handful of days
    // can't show sustained behavior.
    minEligibleDays: 14,
    // If more than this share of a month's eligible days can't be verified from
    // the historical data for EITHER metric (completion or Challenge), that
    // month is left out of the COMMON VERIFIED MONTHS — the only months that
    // feed the projected tier, for both metrics alike. Months at/below the
    // share are kept, with the unverifiable days left out of the denominators
    // and flagged, and every result also carries a WORST-CASE figure (those
    // days counted as misses) so staff can see whether the tier could change.
    // Tunable here during Tier Lab testing; do not hardcode elsewhere.
    maxUnverifiableShare: 0.25,
    // Completion-trend display: only compare two months that each have at least
    // `minDays` verifiable days, and call a change real at +/- `delta` (5 points).
    trend: { minDays: 10, delta: 0.05 },
  },
});

export const CURRENT_DRAFT_VERSION = 'v1';

export const TIER_LAB_META = Object.freeze({
  bannerTitle: 'TIER SYSTEM — PRE-LAUNCH',
  plannedLaunch: 'December 2026',
  participantVisibility: false,
});

/**
 * Data-provenance fact, not a rule: Base44 history (raw Daily Score and
 * Challenge rows) was imported on 2026-08-31, 09-03 and 09-04 and contains
 * dates through 2026-09-03. Records before the live app took over are
 * incomplete for migrated participants (e.g. a participant whose Base44
 * streak proves unbroken activity has only ~10 of ~26 August rows), so an
 * ABSENT record on/before this date — or on/before a participant's own
 * Base44 checkpoint date, if later — cannot prove a missed day.
 */
export const HISTORICAL_IMPORT_CUTOFF = '2026-09-03';

export function getRuleSet(version = CURRENT_DRAFT_VERSION) {
  const rules = TIER_RULE_SETS[version];
  if (!rules) throw new Error(`Unknown tier rule version: ${version}`);
  return rules;
}
