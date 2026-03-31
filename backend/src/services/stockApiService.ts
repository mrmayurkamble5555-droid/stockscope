// backend/src/services/stockApiService.ts

import axios from 'axios';

const INDIAN_API_BASE_URL = process.env.INDIAN_API_BASE_URL;
const INDIAN_API_KEY = process.env.INDIAN_API_KEY;

if (!INDIAN_API_BASE_URL) {
    throw new Error('INDIAN_API_BASE_URL is not set in environment variables');
}
if (!INDIAN_API_KEY) {
    throw new Error('INDIAN_API_KEY is not set in environment variables');
}

const stockApi = axios.create({
    baseURL: INDIAN_API_BASE_URL,
    timeout: 10000,
    headers: {
        'X-API-Key': INDIAN_API_KEY,
    },
});

/**
 * Search stocks from IndianAPI by name.
 * Docs: GET /stock?name=ITC
 */
export async function searchStocksExternal(query: string) {
    if (!query || !query.trim()) {
        return [];
    }

    try {
        const res = await stockApi.get('/stock', {
            params: { name: query.trim() },
        });

        // Adjust this mapping depending on exact IndianAPI response shape
        return res.data;
    } catch (err: any) {
        console.error(
            'Search proxy error',
            err?.response?.status,
            err?.response?.data || err.message,
        );
        throw new Error('Failed to search stocks from IndianAPI');
    }
}

/**
 * Get single stock details by symbol.
 * Example: if IndianAPI supports /stock?symbol=ITC or /stock/{symbol},
 * adjust the URL/params below accordingly.
 */
export async function getStockExternal(symbol: string) {
    if (!symbol || !symbol.trim()) {
        throw new Error('Symbol is required');
    }

    try {
        const res = await stockApi.get('/stock', {
            params: { symbol: symbol.trim() },
        });

        return res.data;
    } catch (err: any) {
        console.error(
            'Stock proxy error',
            err?.response?.status,
            err?.response?.data || err.message,
        );
        throw new Error('Failed to fetch stock details from IndianAPI');
    }
}
