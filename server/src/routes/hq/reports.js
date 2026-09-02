import { Router } from 'express';
import {
  buildProgramReportData, buildParticipantImpactReportData,
  renderProgramReportPdf, renderParticipantImpactPdf,
  getExportData, rowsToCsv, rowsToXlsx,
} from '../../services/hq/reportsService.js';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPORT_TYPES = ['dailyScores', 'goals', 'tasks', 'volunteerHours', 'challenge', 'inactive'];

// Preview before export — staff reviews the exact numbers that will be
// exported, per the approved scope ("allow staff to review before export").
router.get('/program', async (req, res) => {
  res.json(await buildProgramReportData());
});

router.get('/program/export', async (req, res) => {
  const data = await buildProgramReportData();
  const pdf = await renderProgramReportPdf(data);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="inspire-daily-program-report-${data.generatedAt.slice(0, 10)}.pdf"`);
  res.send(pdf);
});

router.get('/participant/:id', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const data = await buildParticipantImpactReportData(req.params.id, { days });
  if (!data) return res.status(404).json({ error: 'Member not found.' });
  res.json(data);
});

router.get('/participant/:id/export', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const data = await buildParticipantImpactReportData(req.params.id, { days });
  if (!data) return res.status(404).json({ error: 'Member not found.' });
  const pdf = await renderParticipantImpactPdf(data);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="impact-report-${data.user.first_name}-${data.user.last_name}.pdf"`);
  res.send(pdf);
});

router.get('/export/:type', async (req, res) => {
  const { type } = req.params;
  if (!EXPORT_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown export type.' });
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';

  const data = await getExportData(type);
  if (!data) return res.status(404).json({ error: 'No data for this export type.' });

  if (format === 'xlsx') {
    const buffer = await rowsToXlsx(data.rows, data.columns, type);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${type}.xlsx"`);
    return res.send(buffer);
  }
  const csv = rowsToCsv(data.rows, data.columns);
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="${type}.csv"`);
  res.send(csv);
});

export default router;
