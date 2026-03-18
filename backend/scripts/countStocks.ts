import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function countStockKeys() {
    let cursor = "0";
    let count = 0;

    do {
        const [nextCursor, keys] = await redis.scan(cursor, {
            match: "stock:*",
            count: 100,
        });
        count += keys.length;
        cursor = nextCursor;
    } while (cursor !== "0");

    console.log("Total stock keys:", count);
}

countStockKeys();
