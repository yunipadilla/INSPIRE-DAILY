// Silent background agent — Goals section only.
// Self-heals goals whose logged progress already meets their completion
// condition but weren't marked completed (e.g. a request failed mid-flight).
// Never touches any table outside goals/goal_books/goal_logs.
import cron from 'node-cron';
import { query } from '../db.js';
import { isGoalComplete } from '../lib/goalCompletion.js';
import { ptDateString } from '../config/pacificTime.js';
import { PACIFIC_TIME_ZONE } from '../config/pacificTime.js';

export async function runGoalsAgent() {
  const { rows: goals } = await query('select * from goals where completed = false');
  let fixed = 0;
  let errors = 0;

  for (const goal of goals) {
    try {
      const [{ rows: books }, { rows: logs }] = await Promise.all([
        goal.type === 'reading'
          ? query('select * from goal_books where goal_id = $1', [goal.id])
          : Promise.resolve({ rows: [] }),
        query('select * from goal_logs where goal_id = $1', [goal.id]),
      ]);

      if (isGoalComplete(goal, { books, logs })) {
        await query('update goals set completed = true, completed_date = $2 where id = $1', [
          goal.id,
          ptDateString(),
        ]);
        fixed += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`[goalsAgent] failed to check goal ${goal.id}:`, err.message);
    }
  }

  if (fixed > 0 || errors > 0) {
    console.log(`[goalsAgent] checked=${goals.length} autoCompleted=${fixed} errors=${errors}`);
  }
}

export function scheduleGoalsAgent() {
  cron.schedule('*/10 * * * *', () => runGoalsAgent(), { timezone: PACIFIC_TIME_ZONE });
}
