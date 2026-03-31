// backend/src/routes/stockApiRoutes.ts

import { Router } from 'express';
import {
    searchStocksExternalHandler,
    getStockExternalHandler,
} from '../controllers/stockApiController';

const router = Router();

// GET /api/stocks/search?q=ITC
router.get('/search', searchStocksExternalHandler);

// GET /api/stocks/:symbol
router.get('/:symbol', getStockExternalHandler);

export default router;
