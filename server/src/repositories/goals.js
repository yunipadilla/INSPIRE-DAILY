import { query } from '../db.js';

export async function listGoalsForUser(userId) {
  const { rows } = await query(
    'select * from goals where user_id = $1 order by updated_at desc',
    [userId]
  );
  return rows;
}

export async function getGoal(id, userId) {
  const { rows } = await query('select * from goals where id = $1 and user_id = $2', [id, userId]);
  return rows[0] || null;
}

export async function createGoal(userId, { type, name, targetDate, details }) {
  const { rows } = await query(
    `insert into goals (user_id, type, name, target_date, details)
     values ($1, $2, $3, $4, $5) returning *`,
    [userId, type, name, targetDate || null, details || {}]
  );
  return rows[0];
}

export async function updateGoalDetails(id, details) {
  const { rows } = await query(
    `update goals set details = $2, updated_at = now() where id = $1 returning *`,
    [id, details]
  );
  return rows[0];
}

export async function touchGoal(id) {
  await query('update goals set updated_at = now() where id = $1', [id]);
}

export async function markGoalCompleted(id, completedDate) {
  const { rows } = await query(
    `update goals set completed = true, completed_date = $2, updated_at = now() where id = $1 returning *`,
    [id, completedDate]
  );
  return rows[0];
}

export async function deleteGoal(id, userId) {
  await query('delete from goals where id = $1 and user_id = $2', [id, userId]);
}

// --- Reading goal books ---

export async function createBook(goalId, userId, { title, author, totalPages, startDate, orderIndex }) {
  const { rows } = await query(
    `insert into goal_books (goal_id, user_id, title, author, total_pages, start_date, order_index)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [goalId, userId, title, author || null, totalPages, startDate || null, orderIndex || 0]
  );
  return rows[0];
}

export async function listBooksForGoal(goalId) {
  const { rows } = await query(
    'select * from goal_books where goal_id = $1 order by order_index asc, start_date asc nulls last',
    [goalId]
  );
  return rows;
}

export async function getBook(id, userId) {
  const { rows } = await query('select * from goal_books where id = $1 and user_id = $2', [id, userId]);
  return rows[0] || null;
}

export async function updateBookProgress(id, currentPage) {
  const { rows } = await query(
    'update goal_books set current_page = $2 where id = $1 returning *',
    [id, currentPage]
  );
  return rows[0];
}

export async function markBookCompleted(id, completedDate) {
  const { rows } = await query(
    'update goal_books set completed = true, completed_date = $2 where id = $1 returning *',
    [id, completedDate]
  );
  return rows[0];
}

// --- Goal logs (fitness/learning/meditation/custom activity) ---

export async function createLog(goalId, userId, { bookId, date, logType, note, value, activity, weekKey }) {
  const { rows } = await query(
    `insert into goal_logs (goal_id, user_id, book_id, date, log_type, note, value, activity, week_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [goalId, userId, bookId || null, date, logType, note || null, value ?? null, activity || null, weekKey || null]
  );
  return rows[0];
}

export async function listLogsForGoal(goalId) {
  const { rows } = await query('select * from goal_logs where goal_id = $1 order by date asc', [goalId]);
  return rows;
}

export async function findLogByDate(goalId, date) {
  const { rows } = await query('select * from goal_logs where goal_id = $1 and date = $2', [goalId, date]);
  return rows[0] || null;
}
