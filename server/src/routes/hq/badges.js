import { Router } from 'express';
import { BADGE_CATALOG, findBadgeCatalogEntry } from '../../config/badgeCatalog.js';
import { findByUserAndTypeAndName, insertBadge } from '../../repositories/badges.js';
import { query } from '../../db.js';
import { ptDateString } from '../../config/pacificTime.js';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/badge-catalog', async (req, res) => {
  res.json({ catalog: BADGE_CATALOG });
});

router.post('/members/:id/badges', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid member id.' });
  }

  const { catalogKey, reason } = req.body || {};
  const entry = findBadgeCatalogEntry(catalogKey);
  if (!entry) {
    return res.status(400).json({ error: 'Not a recognized badge — choose one from the catalog.' });
  }

  const memberRes = await query(
    "select id from users where id = $1 and system_role = 'participant'",
    [req.params.id]
  );
  if (memberRes.rows.length === 0) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const existing = await findByUserAndTypeAndName(req.params.id, entry.badgeType, entry.name);
  if (existing) {
    return res.status(409).json({ error: 'This member has already earned that badge.' });
  }

  const badge = await insertBadge(req.params.id, {
    badgeType: entry.badgeType,
    name: entry.name,
    description: entry.description,
    iconEmoji: entry.iconEmoji,
    earnedDate: ptDateString(),
    awardedBy: req.user.id,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null,
    source: 'manual',
  });

  res.status(201).json({
    badge: {
      id: badge.id,
      badgeType: badge.badge_type,
      name: badge.name,
      description: badge.description,
      iconEmoji: badge.icon_emoji,
      earnedDate: badge.earned_date,
      reason: badge.reason,
      source: badge.source,
      awardedByName: `${req.user.first_name} ${req.user.last_name}`,
    },
  });
});

export default router;
