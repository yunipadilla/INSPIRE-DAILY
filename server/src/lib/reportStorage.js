/**
 * Report storage — Daily Scores Summary Agent PDFs.
 *
 * Local filesystem today. Organized by year -> month -> participant, exactly
 * as specified, under <repo root>/reports/ (a sibling of server/ and
 * client/, gitignored — these PDFs contain participant PII and must never
 * be committed):
 *
 *   reports/participant-summaries/weekly/2026/09/Seth-Christian/Seth-Christian-weekly-2026-09-01_to_2026-09-07.pdf
 *   reports/participant-summaries/monthly/2026/09/Seth-Christian/Seth-Christian-monthly-2026-09.pdf
 *
 * PRODUCTION STORAGE NOTE: Render's filesystem is ephemeral — anything
 * written here does not survive a redeploy/restart in production. Supabase
 * Storage (a private "inspire-reports" bucket, same logical path structure)
 * is the intended production-persistent home, but this app has no
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configured anywhere and no
 * @supabase/supabase-js dependency installed — wiring that up blind, without
 * being able to verify bucket creation/policies actually work, risks either
 * a broken upload path or an insecure public bucket. Per the approved scope
 * ("if production storage cannot be completed safely without credentials/
 * config changes: keep local generation working, report the blocker"), this
 * module stays local-only for now. Adding Storage support later means:
 * `npm install @supabase/supabase-js`, add SUPABASE_URL + a service-role key
 * to env, create a private "inspire-reports" bucket, and call its upload API
 * with the same relative path this module already produces.
 */
import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/lib -> server/src -> server -> repo root -> reports
const REPORTS_ROOT = path.join(__dirname, '..', '..', '..', 'reports');

function slug(name) {
  return String(name).trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '');
}

/** Deterministic relative path (never randomized) — regenerating the same
 * report for the same person/period always resolves to the same file. */
export function buildReportRelativePath({ firstName, lastName, reportType, periodStart, periodEnd }) {
  const personSlug = `${slug(firstName)}-${slug(lastName)}`;
  const [year, month] = periodStart.split('-');
  const filename =
    reportType === 'weekly'
      ? `${personSlug}-weekly-${periodStart}_to_${periodEnd}.pdf`
      : `${personSlug}-monthly-${periodStart.slice(0, 7)}.pdf`;
  return path.join('participant-summaries', reportType, year, month, personSlug, filename);
}

export async function saveReportPdf(relativePath, buffer) {
  const absolutePath = path.join(REPORTS_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return { absolutePath, sizeBytes: buffer.length };
}

export async function readReportPdf(relativePath) {
  const absolutePath = path.join(REPORTS_ROOT, relativePath);
  return readFile(absolutePath);
}

export { REPORTS_ROOT };
