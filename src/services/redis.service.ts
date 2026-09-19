import { Redis, type Redis as RedisType } from 'ioredis';
import { env } from '../config/env.js';
import { DOWNLOAD_LIMIT, WINDOW_SECONDS } from '../config/constants.js';
import type { PlatformType, label } from '../types/index.js';
import { notifyAdminError } from '../utils/logger.js';

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetInSeconds: number;
    fetchFailed: boolean
}

export interface MediaGroupItem {
    fileSource: string;
    type: 'photo' | 'video';
}

export interface CachedMediaData {
    mediaGroup?: MediaGroupItem[];
    formats?: Record<string, string>;
}

export interface SendMediaProp {
    mediaId: string,
    platform: PlatformType,
    label?: label,
    fileId?: string
    mediaGroup?: MediaGroupItem[];
}

let redisClient: RedisType | null = null;

// Initializes or returns the existing Redis client singleton.
export const getRedisClient = (): RedisType => {
    if (!redisClient) {
        const redisUrl = env.REDIS_URL;
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => Math.min(times * 100, 3000),
        });

        redisClient.on('error', (err) => {
            console.error('[RedisService] Redis getClient Error:', err);
        });
    }
    return redisClient;
}

// Retrieves a cached item for a given key
export const getCachedItem = async (key: string): Promise<string | null> => {
    try {
        const redis = getRedisClient();
        return await redis.get(key);
    } catch (error: any) {
        console.error(`[RedisService] Failed to fetch key "${key}": ${error.message || error}`);
        notifyAdminError(error, 'getCachedItem');
        return null;
    }
}

// Caches a Telegram file_id for a video id
export const setMediaCache = async ({
    mediaId,
    platform,
    label,
    fileId,
    mediaGroup
}: SendMediaProp): Promise<void> => {
    const ONE_YEAR = 31_536_000;
    const noCachePlatforms: PlatformType[] = ['instagram_story', 'other'];
    if (!mediaId || !platform || noCachePlatforms.includes(platform)) return;

    try {
        const redis = getRedisClient();
        const mediaKey = `media:${platform}:${mediaId}`;
        const existingCacheRaw = await getCachedItem(mediaKey);
        let cacheData: CachedMediaData = existingCacheRaw ? JSON.parse(existingCacheRaw) : {};

        // If storing gallery-dl items (Album / Multi-media)
        if (mediaGroup && mediaGroup.length > 0) {
            cacheData.mediaGroup = mediaGroup;
        }

        // If storing yt-dlp single files by quality/format
        if (label && fileId) {
            cacheData.formats = {
                ...(cacheData.formats || {}),
                [label]: fileId,
            };
        }

        await redis.set(mediaKey, JSON.stringify(cacheData), 'EX', ONE_YEAR);
    } catch (error: any) {
        console.error(`[RedisService] Failed to cache media: ${error?.message || error}`);
        notifyAdminError(error, 'setMediaCache');
    }
};

// Check user rate limit
export const checkRateLimit = async (userId: number): Promise<RateLimitResult> => {
    try {
        if (!userId) {
            return {
                allowed: false,
                remaining: 0,
                resetInSeconds: 0,
                fetchFailed: false
            };
        }

        const redis = getRedisClient();
        const key = `ratelimit:${userId}`;

        const rawCount = await redis.get(key);
        const currentCount = rawCount ? parseInt(rawCount, 10) : 0;

        const ttl = await redis.ttl(key);
        const resetInSeconds = ttl > 0 ? ttl : WINDOW_SECONDS;

        if (currentCount >= DOWNLOAD_LIMIT) {
            return {
                allowed: false,
                remaining: 0,
                resetInSeconds,
                fetchFailed: false
            };
        }

        return {
            allowed: true,
            remaining: DOWNLOAD_LIMIT - currentCount,
            resetInSeconds,
            fetchFailed: false
        };
    } catch (error: any) {
        console.error(`[RedisService] Failed to check ratelimit: ${error?.message || error}`)
        notifyAdminError(error, 'checkRateLimit');
        return {
            allowed: false,
            remaining: 0,
            resetInSeconds: 0,
            fetchFailed: true
        };
    }
}

// increase user ratelimit
export const increaseRateLimit = async (userId: number) => {
    try {
        if (!userId) return;
        if (env.UNLIMITED_USERS.includes(userId)) return;

        const redis = getRedisClient();
        const key = `ratelimit:${userId}`;

        // Increment counter atomically
        const currentCount = await redis.incr(key);

        // Set TTL on the first request in this window
        if (currentCount === 1) {
            await redis.expire(key, WINDOW_SECONDS);
        }
    } catch (error: any) {
        console.error(`[RedisService] Failed to increase ratelimit: ${error?.message || error}`)
        notifyAdminError(error, 'increaseRateLimit');
    }
}