import IORedis from "ioredis";
import { REDIS_URL, USE_REDIS } from "../config/env.js";
import logger from "./logger.js";

export const redis = new IORedis(REDIS_URL, {
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3
});

redis.on('error', (err) => {
    logger.error(`❌ Redis connection error: ${err.message}`);
});

redis.on('connect', () => {
    logger.info('✅ Redis connected');
});

export async function testRedisConnection() {
    if (USE_REDIS !== 'true') {
        logger.info('ℹ️ Redis is disabled for this environment. Skipping Redis connection check.');
        return true;
    }

    try {
        await redis.ping();
        logger.info('✅ Redis connection test successful');
        return true;
    } catch (err) {
        logger.error(`❌ Redis connection test failed: ${err.message}`);
        throw err;
    }
}