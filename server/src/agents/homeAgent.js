// Silent background agent — Home section only.
// Keeps the Celebration Feed clean (posts older than 7 days must disappear)
// and never touches any table outside this section.
import cron from 'node-cron';
import { query } from '../db.js';
import { PACIFIC_TIME_ZONE } from '../config/pacificTime.js';

export async function runHomeAgent() {
  const { rowCount } = await query('delete from celebration_feed where expires_at <= now()');
  if (rowCount > 0) {
    console.log(`[homeAgent] purged ${rowCount} expired celebration feed post(s)`);
  }
}

export function scheduleHomeAgent() {
  cron.schedule('*/15 * * * *', () => runHomeAgent(), { timezone: PACIFIC_TIME_ZONE });
}
