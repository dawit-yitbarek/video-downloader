import { WINDOW_SECONDS, DOWNLOAD_LIMIT } from "../config/constants.js";
import { redis } from "../utils/redis.js";


export async function checkDownloadLimit(userId) {
    const key = `rate:download:${userId}`;

    const count = Number(await redis.get(key)) || 0;
    let ttl = await redis.ttl(key);

    if (count > 0 && ttl === -1) {
        await redis.expire(key, WINDOW_SECONDS);
        ttl = WINDOW_SECONDS;
    }

    return {
        allowed: count < DOWNLOAD_LIMIT,
        remaining: Math.max(0, DOWNLOAD_LIMIT - count),
        resetIn: ttl,
    };
}


export async function increaseDownloadCount(userId) {
    const key = `rate:download:${userId}`;

    const count = await redis.incr(key);

    // first successful download, start 24h window
    if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);

    return {
        count,
        remaining: Math.max(0, DOWNLOAD_LIMIT - count),
        resetIn: ttl,
    };
}