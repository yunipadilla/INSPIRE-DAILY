// Silent background agent — Internship Tasks section only.
// Flags in-progress signups whose task posting has since been deactivated,
// so staff data stays legible even though nothing here needs a hard fix.
// Never touches any table outside internship_tasks/task_signups.
import cron from 'node-cron';
import { query } from '../db.js';
import { PACIFIC_TIME_ZONE } from '../config/pacificTime.js';

export async function runInternshipTasksAgent() {
  const { rows } = await query(
    `select ts.id from task_signups ts
     join internship_tasks t on t.id = ts.task_id
     where ts.status = 'in_progress' and t.active = false`
  );

  if (rows.length > 0) {
    console.log(`[internshipTasksAgent] ${rows.length} in-progress signup(s) reference a deactivated task`);
  }
}

export function scheduleInternshipTasksAgent() {
  cron.schedule('*/15 * * * *', () => runInternshipTasksAgent(), { timezone: PACIFIC_TIME_ZONE });
}
