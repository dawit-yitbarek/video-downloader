import { WINDOW_SECONDS, ATTEMPT_LIMIT, DOWNLOAD_LIMIT } from "../config/constants.js";

export async function checkAndIncreaseAttempt(redis, userId) {
    const key = `rate:attempt:${userId}`;

    // If the key didn't exist, Redis creates it and returns 1
    const newCount = await redis.incr(key);
    let ttl = await redis.ttl(key);

    // If it's a new key, set the expiration window
    if (newCount === 1 || ttl === -1) {
        await redis.expire(key, WINDOW_SECONDS);
        ttl = WINDOW_SECONDS;
    }

    const isAllowed = newCount <= ATTEMPT_LIMIT;

    return {
        allowed: isAllowed,
        remaining: Math.max(0, ATTEMPT_LIMIT - newCount),
        resetIn: ttl
    };
}


export async function checkDownloadLimit(redis, userId) {
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


export async function increaseDownloadCount(redis, userId) {
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