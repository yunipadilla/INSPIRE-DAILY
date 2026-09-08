export const SUMMER_CHALLENGE_LAUNCH_DATE = '2026-06-04';
export const CELEBRATION_FEED_EXPIRY_DAYS = 7;
export const MAX_FOLLOW_ROLE = 'intern';

// Volunteer/Project Work moved from Daily Scores into Inspire Challenge on
// this date — the boundary the canonical volunteer-time resolver
// (services/volunteerTimeService.js) uses to decide which source of truth
// applies to a given date, so legacy Daily Score hours and new Challenge
// project_minutes are never both counted for the same day.
export const PROJECT_WORK_LAUNCH_DATE = '2026-09-08';
