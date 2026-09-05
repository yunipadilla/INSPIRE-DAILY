/**
 * PDF renderer for Daily Scores Summary Agent reports — one consistent,
 * minimal template for both weekly and monthly summaries. Reuses pdfkit
 * (already a dependency for reportsService.js's program/participant PDFs)
 * rather than adding a second PDF library.
 *
 * Deliberately NOT a raw data dump: reflection dimensions are rendered as a
 * compact trend table (current vs. prior average + direction), never as a
 * summed score, per Inspire 2.2 Part 2/6.
 */
import PDFDocument from 'pdfkit';

const BRAND = '#6E56CF'; // Inspire lavender accent — matches --color-primary
const INK = '#1a1a2e';
const MUTED = '#6b6b85';

const DIRECTION_ARROW = { up: '▲', down: '▼', flat: '→', insufficient_data: '—' };

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function sectionTitle(doc, text) {
  doc.moveDown(0.8);
  doc.fillColor(BRAND).fontSize(12).font('Helvetica-Bold').text(text.toUpperCase(), { characterSpacing: 0.5 });
  doc.moveDown(0.2);
  doc.fillColor(INK).font('Helvetica').fontSize(10);
}

function bulletList(doc, items) {
  for (const item of items) {
    doc.fillColor(INK).fontSize(10).text(`•  ${item}`, { paragraphGap: 3 });
  }
}

export async function renderSummaryPdf(data) {
  const doc = new PDFDocument({ margin: 48, size: 'LETTER' });

  // Header
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(18).text('INSPIRE DAILY', { continued: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Daily Scores Summary Agent — internal staff report');
  doc.moveDown(0.6);
  doc.moveTo(48, doc.y).lineTo(564, doc.y).strokeColor('#e0e0ea').stroke();
  doc.moveDown(0.6);

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(`${data.user.firstName} ${data.user.lastName}`);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(
    `${data.reportType === 'weekly' ? 'Weekly' : 'Monthly'} report — ${data.periodLabel}  |  Role: ${data.user.appRole}  |  Current streak: ${data.streakCount} day(s)  |  Generated ${new Date(data.generatedAt).toLocaleString()}`
  );

  // Participation
  sectionTitle(doc, 'Participation');
  doc.text(
    `Daily Score completion: ${data.participation.submitted} of ${data.participation.eligibleDays} eligible days` +
      (data.participation.pct == null ? ' (not enough data)' : ` — ${data.participation.pct}%`)
  );
  doc.text(
    `Inspire Challenge: ${data.challenge.daysLogged} of ${data.challenge.eligibleDays} eligible days` +
      (data.challenge.pct == null ? ' (not enough data)' : ` — ${data.challenge.pct}%`) +
      ` — ${data.challenge.points} canonical point(s) this period`
  );
  doc.text(`Tasks completed: ${data.tasksCompleted}   |   Volunteer hours logged: ${data.volunteerHours}`);

  // Reflection trends — table, not a summed score
  sectionTitle(doc, 'Reflection Trends (1-10 scale)');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED);
  const colX = [48, 200, 280, 360, 440];
  doc.text('Dimension', colX[0], doc.y, { continued: false, width: 150 });
  const headerY = doc.y - doc.currentLineHeight();
  doc.text('This period', colX[1], headerY, { width: 80 });
  doc.text('Prior period', colX[2], headerY, { width: 80 });
  doc.text('Change', colX[3], headerY, { width: 80 });
  doc.text('Trend', colX[4], headerY, { width: 80 });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor(INK);
  for (const d of data.dimensions) {
    const rowY = doc.y;
    doc.text(d.label, colX[0], rowY, { width: 150 });
    doc.text(d.current == null ? '—' : String(d.current), colX[1], rowY, { width: 80 });
    doc.text(d.prior == null ? '—' : String(d.prior), colX[2], rowY, { width: 80 });
    doc.text(d.delta == null ? '—' : (d.delta > 0 ? '+' : '') + d.delta, colX[3], rowY, { width: 80 });
    doc.text(DIRECTION_ARROW[d.direction] || '—', colX[4], rowY, { width: 80 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.2);
  doc.fillColor(MUTED).fontSize(8).text('These are reflection/trend indicators, not a combined score or grade.', 48);
  doc.fillColor(INK).fontSize(10);

  // Goals
  sectionTitle(doc, 'Goals');
  doc.text(
    `Active goals: ${data.goals.active}   |   Completed this period: ${data.goals.completedInPeriod}` +
      (data.goals.progressPct == null ? '' : `   |   Progress: ${data.goals.progressPct}%`)
  );

  if (data.reportType === 'monthly') {
    sectionTitle(doc, 'Badges Earned This Month');
    if (data.badges.length === 0) doc.fillColor(MUTED).text('None this month.');
    else bulletList(doc, data.badges.map((b) => `${b.name} — ${b.earnedDate}`));
  }

  sectionTitle(doc, 'Highlights');
  bulletList(doc, data.highlights);

  sectionTitle(doc, 'Needs Attention');
  bulletList(doc, data.needsAttention);

  sectionTitle(doc, 'Summary');
  doc.fillColor(INK).fontSize(10).text(data.summary, { align: 'left' });

  sectionTitle(doc, `Next-${data.reportType === 'weekly' ? 'Week' : 'Month'} Focus`);
  bulletList(doc, data.nextPeriodFocus);

  doc.moveDown(1);
  doc.fillColor(MUTED).fontSize(8).text(
    'Generated from live program data by the Inspire Daily Summary Agent. Staff/admin internal use only — not shared with participants automatically.'
  );

  return pdfToBuffer(doc);
}
