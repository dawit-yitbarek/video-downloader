import IORedis from "ioredis";
import { REDIS_URL } from "../config/env.js";
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
    try {
        await redis.ping();
        logger.info('✅ Redis connection test successful');
        return true;
    } catch (err) {
        logger.error(`❌ Redis connection test failed: ${err.message}`);
        throw err;
    }
}