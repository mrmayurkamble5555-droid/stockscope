// backend/src/controllers/stockApiController.ts

import { Request, Response } from 'express';
import { searchStocksExternal, getStockExternal } from '../services/stockApiService';

export async function searchStocksExternalHandler(req: Request, res: Response) {
    const q = String(req.query.q || '').trim();

    try {
        const results = await searchStocksExternal(q);
        res.json({ results });
    } catch (err: any) {
        console.error('searchStocksExternalHandler error', err.message);
        res.status(502).json({ message: 'Failed to search stocks' });
    }
}

export async function getStockExternalHandler(req: Request, res: Response) {
    const symbol = String(req.params.symbol || '').trim();

    try {
        const data = await getStockExternal(symbol);
        res.json({ data });
    } catch (err: any) {
        console.error('getStockExternalHandler error', err.message);
        res.status(502).json({ message: 'Failed to fetch stock details' });
    }
}
