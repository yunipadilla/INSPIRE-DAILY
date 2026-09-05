import { query } from '../db.js';

export async function insertReportSummary({ userId, reportType, periodStart, periodEnd, generatedBy, storagePath, fileSizeBytes }) {
  const { rows } = await query(
    `insert into report_summaries (user_id, report_type, period_start, period_end, generated_by, storage_path, file_size_bytes)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [userId, reportType, periodStart, periodEnd, generatedBy, storagePath, fileSizeBytes]
  );
  return rows[0];
}

export async function listReportSummariesForUser(userId, limit = 20) {
  const { rows } = await query(
    `select id, report_type, period_start, period_end, generated_at, generated_by, file_size_bytes
       from report_summaries where user_id = $1 order by generated_at desc limit $2`,
    [userId, limit]
  );
  return rows;
}

export async function findReportSummaryById(id, userId) {
  const { rows } = await query(
    `select * from report_summaries where id = $1 and user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}
