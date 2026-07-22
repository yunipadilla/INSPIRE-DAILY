import { query } from '../db.js';

const LEVELS_VISIBLE_TO = {
  intern: ['intern'],
  postgrad: ['intern', 'postgrad'],
  staff: ['intern', 'postgrad', 'alumni', 'staff'],
};

export function visibleLevelsFor(appRole) {
  return LEVELS_VISIBLE_TO[appRole] || [];
}

export async function listVisibleTasks(appRole, userId) {
  const levels = visibleLevelsFor(appRole);
  if (levels.length === 0) return [];
  const { rows } = await query(
    `select t.*, u.first_name as posted_by_first_name, u.last_name as posted_by_last_name,
            ts.id as my_signup_id, ts.status as my_signup_status
     from internship_tasks t
     left join users u on u.id = t.posted_by
     left join task_signups ts on ts.task_id = t.id and ts.user_id = $2
     where t.active = true and t.level = any($1::text[])
     order by t.created_at desc`,
    [levels, userId]
  );
  return rows;
}

export async function getTask(id) {
  const { rows } = await query('select * from internship_tasks where id = $1', [id]);
  return rows[0] || null;
}

export async function createTask(postedBy, { title, description, level }) {
  const { rows } = await query(
    `insert into internship_tasks (title, description, posted_by, level) values ($1,$2,$3,$4) returning *`,
    [title, description || null, postedBy, level]
  );
  return rows[0];
}

export async function setTaskActive(id, active) {
  const { rows } = await query('update internship_tasks set active = $2 where id = $1 returning *', [id, active]);
  return rows[0];
}

export async function findSignup(taskId, userId) {
  const { rows } = await query('select * from task_signups where task_id = $1 and user_id = $2', [taskId, userId]);
  return rows[0] || null;
}

export async function createSignup(taskId, userId) {
  const { rows } = await query(
    `insert into task_signups (task_id, user_id, status) values ($1,$2,'in_progress') returning *`,
    [taskId, userId]
  );
  return rows[0];
}

export async function getSignup(id, userId) {
  const { rows } = await query('select * from task_signups where id = $1 and user_id = $2', [id, userId]);
  return rows[0] || null;
}

export async function updateSignup(id, { status, hoursSpent, notes, completedDate }) {
  const { rows } = await query(
    `update task_signups
     set status = coalesce($2, status),
         hours_spent = coalesce($3, hours_spent),
         notes = coalesce($4, notes),
         completed_date = coalesce($5, completed_date)
     where id = $1 returning *`,
    [id, status || null, hoursSpent ?? null, notes ?? null, completedDate || null]
  );
  return rows[0];
}

export async function listMySignups(userId) {
  const { rows } = await query(
    `select ts.*, t.title, t.description, t.level
     from task_signups ts
     join internship_tasks t on t.id = ts.task_id
     where ts.user_id = $1
     order by ts.created_at desc`,
    [userId]
  );
  return rows;
}

export async function listAllSignupsForHub() {
  const { rows } = await query(
    `select ts.*, t.title, t.level, u.first_name, u.last_name, u.app_role
     from task_signups ts
     join internship_tasks t on t.id = ts.task_id
     join users u on u.id = ts.user_id
     order by ts.created_at desc`
  );
  return rows;
}
