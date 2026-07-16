import { redis } from "../utils/redis.js";
import { telegram } from "../utils/telegram.js";
import { BOT_USERNAME } from "../config/env.js";
import logger from "../utils/logger.js";
import { Markup } from "telegraf";
import { getVideoMetaData } from "./getVideoMeta.js";

export const sendCachedVideoData = async (chatId, label, url, messageId) => {
    try {
        const cleanUrl = getCleanUrl(url);
        let videoKey = null;
        const resolvedIdRoute = await redis.get(`video:url_map:${cleanUrl}`);

        if (resolvedIdRoute) {
            videoKey = `video:${resolvedIdRoute}`;
        } else {
            const videoData = await getVideoMetaData(url)
            if (!videoData) return false;
            const { videoId, extractor } = videoData;
            videoKey = `video:${extractor}:${videoId}`;
            // Cache the reference link map instantly so we completely skip yt-dlp metadata extraction next time
            await redis.set(`video:url_map:${cleanUrl}`, `${extractor}:${videoId}`, 'EX', 604800); // 7-day TTL expiration hold
        }

        const cacheData = await redis.get(videoKey);

        if (cacheData) {
            const qualityMap = JSON.parse(cacheData);

            if (qualityMap[label]) {
                if (label === "audio") {
                    await telegram.sendAudio(chatId, qualityMap[label], {
                        caption: `${BOT_USERNAME}`,
                        title: qualityMap.title,
                    })
                } else {
                    await telegram.sendVideo(chatId, qualityMap[label], {
                        caption: `🚀 Downloaded in ${BOT_USERNAME} \n\nUse it and share with friends! 🥰`,
                        supports_streaming: true,
                        ...Markup.inlineKeyboard([[
                            { text: "Share ⬆️", switch_inline_query: `Check out this downloader!` }
                        ]])
                    });
                }

                if (chatId && messageId) {
                    await telegram.deleteMessage(chatId, messageId).catch(err =>
                        logger.warn(`⚠️ Non-fatal: Could not delete initial message card: ${err.message}`)
                    );
                }
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    } catch (error) {
        logger.error(`Error in sendCachedVideoData: ${error}`);
        return false;
    }
}

export const cacheVideoData = async (fileId, label, videoId, title, extractor, videoUrl) => {
    try {
        if (!fileId || !videoId || !extractor) return;
        const idCacheKey = `video:${extractor}:${videoId}`;

        // Fetch current map or initialize an empty one
        const existingCache = await redis.get(idCacheKey);
        const currentMap = existingCache ? JSON.parse(existingCache) : { title: title };

        // Append the new specific resolution file_id to the object map
        currentMap[label] = fileId;

        await redis.set(idCacheKey, JSON.stringify(currentMap));
        if (videoUrl) {
            const urlCacheKey = `video:url_map:${getCleanUrl(videoUrl)}`;
            await redis.set(urlCacheKey, `${extractor}:${videoId}`, 'EX', 604800); // 7-day TTL expiration hold
        }
    } catch (error) {
        logger.error(`Error caching video data: ${error}`);
    }
}

export const getCachedMetadata = async (videoUrl) => {
    try {
        const cleanUrl = getCleanUrl(videoUrl);
        const cacheKey = `metadata:${cleanUrl}`;
        const cachedMetadata = await redis.get(cacheKey);

        if (cachedMetadata) {
            const metadata = JSON.parse(cachedMetadata);
            return metadata;
        } else {
            return null;
        }
    } catch (error) {
        logger.error(`Error getting cached metadata: ${error}`);
        return null;
    }
}

export const cacheMetadata = async (videoUrl, metadata) => {
    try {
        if (!metadata) return;
        const cleanUrl = getCleanUrl(videoUrl);
        const cacheKey = `metadata:${cleanUrl}`;
        await redis.set(cacheKey, JSON.stringify(metadata), 'EX', 172800); // Cache for 48 hours
    } catch (error) {
        logger.error(`Error caching metadata: ${error}`);
    }
}

function getCleanUrl(inputUrl) {
    try {
        // Regex to find a URL starting with http:// or https://
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = inputUrl.match(urlRegex);

        if (!matches) {
            logger.warn("No URL found in the input string.");
            return inputUrl;
        }

        // Take the first URL found
        const extractedUrl = matches[0];
        const parsed = new URL(extractedUrl);

        let cleanUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;

        // Remove trailing slash if it exists and it isn't just the root domain slash
        if (cleanUrl.endsWith('/') && parsed.pathname !== '/') {
            cleanUrl = cleanUrl.slice(0, -1);
        }

        return cleanUrl;
    } catch (e) {
        logger.error(`Error parsing URL: ${e}`);
        return inputUrl; // Fallback if parsing fails
    }
}
