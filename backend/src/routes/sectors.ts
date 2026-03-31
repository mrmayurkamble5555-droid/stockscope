import { Router } from 'express';
import {
    getAllSectorsHandler,
    getSectorDetailHandler,
    reclassifyOthersHandler,
} from '../controllers/sectorsController';

const router = Router();

// GET /api/sectors
// Returns all sectors with stock count + top ranked stocks
router.get('/', getAllSectorsHandler);

// GET /api/sectors/:sectorName
// Returns full ranked stock list for one sector
router.get('/:sectorName', getSectorDetailHandler);

// POST /api/sectors/reclassify
// Admin trigger — re-classifies "Others" stocks
router.post('/reclassify', reclassifyOthersHandler);

export default router;