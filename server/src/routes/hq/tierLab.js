// Tier Lab (pre-launch, shadow mode). Mounted under /api/hq, so it inherits the
// router-level requireAuth + requireHQAccess (staff/admin/super_admin only) —
// there is deliberately NO participant-facing counterpart anywhere.
import { Router } from 'express';
import { z } from 'zod';
import { getTierLabOverview, getTierLabMember, simulateTierRules } from '../../services/hq/tierLabService.js';

const router = Router();
const MONTH_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthParam = (m) => (typeof m === 'string' && MONTH_RE.test(m) ? m : undefined);

router.get('/', async (req, res) => {
  res.json(await getTierLabOverview({ endMonth: monthParam(req.query.month) }));
});

router.get('/members/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Participant not found.' });
  const out = await getTierLabMember(req.params.id, { endMonth: monthParam(req.query.month) });
  if (!out) return res.status(404).json({ error: 'Participant not found.' });
  res.json(out);
});

// Percent in the request (0–100) -> fraction for the engine. Thresholds must not
// increase from Tier 1 down to Tier 3 (otherwise "best tier first" is meaningless).
const tierInput = z.object({
  tier: z.number().int().min(1).max(3),
  minCompletionPct: z.number().min(0).max(100),
  minChallengeAvg: z.number().min(0).max(200),
});
const simulateSchema = z.object({ tiers: z.array(tierInput).length(3) }).refine(
  ({ tiers }) => {
    const t = [...tiers].sort((a, b) => a.tier - b.tier);
    return t.map((x) => x.tier).join() === '1,2,3'
      && t[0].minCompletionPct >= t[1].minCompletionPct && t[1].minCompletionPct >= t[2].minCompletionPct
      && t[0].minChallengeAvg >= t[1].minChallengeAvg && t[1].minChallengeAvg >= t[2].minChallengeAvg;
  },
  { message: 'Tiers 1, 2 and 3 are required, and each requirement must not increase from Tier 1 down to Tier 3.' }
);

// POST only because it carries a body — this is a PREVIEW: nothing is saved.
router.post('/simulate', async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid thresholds.' });
  const tiers = [...parsed.data.tiers]
    .sort((a, b) => a.tier - b.tier)
    .map((t) => ({ tier: t.tier, minCompletion: t.minCompletionPct / 100, minChallengeAvg: t.minChallengeAvg }));
  res.json(await simulateTierRules(tiers, { endMonth: monthParam(req.query.month) }));
});

export default router;
