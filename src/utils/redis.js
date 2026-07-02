import IORedis from "ioredis";
import { REDIS_URL } from "../config/env.js";

export const redis = new IORedis(REDIS_URL, {
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

redis.on('connect', () => {
    console.log('✅ Redis connected');
});

export async function testRedisConnection() {
    try {
        await redis.ping();
        console.log('✅ Redis connection test successful');
        return true;
    } catch (err) {
        console.error('❌ Redis connection test failed:', err.message);
        throw err;
    }
}