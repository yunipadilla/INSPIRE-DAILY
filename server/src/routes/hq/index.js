import { Router } from 'express';
import { requireAuth, requireHQAccess } from '../../middleware/auth.js';
import overviewRoutes from './overview.js';
import membersRoutes from './members.js';

const router = Router();

// Every route under /api/hq requires an authenticated staff/admin/super_admin
// session — enforced here at the API layer, not by hiding navigation on the
// client (see requireHQAccess in middleware/auth.js).
router.use(requireAuth, requireHQAccess);

router.use('/overview', overviewRoutes);
router.use('/members', membersRoutes);

export default router;
