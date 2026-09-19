import { type Context } from 'grammy';
import type { Message } from "grammy/types"
import { bot } from '../bot/index.js'
import type { downloadingTools } from '../types/index.js';
import { identifyPlatformType } from '../utils/platformTypeDetector.js';
import { extractMediaId } from '../utils/extractMediaId.js';
import { checkRateLimit, getCachedItem, type CachedMediaData } from './redis.service.js';
import { sendYoutubeQualityOptions, sendSingleMedia, sendGroupMedia, sendMediaErrorMessage, sendRateLimitedMessage } from '../bot/helpers/messageSender.js';
import type { PlatformType, label } from '../types/index.js';
import { downloadQueue } from './worker.service.js';
import { sendUrlToTargetBot } from './userBot/queueManager.js';
import { userBotPlatforms, galleryDlPlatforms } from '../config/constants.js';
import { resolveFullUrl } from '../utils/urlResolver.js';
import { notifyAdminError } from '../utils/logger.js';
import { env } from '../config/env.js';

interface decideDownlodingToolProp {
    statusMessage: Message.TextMessage
    mediaId: string | null,
    url: string,
    platform: PlatformType
    label: label
    skipUserBot?: boolean
}

interface handleMediaDownloadProp {
    url: string;
    ctx: Context;
    skipYoutubeCheck?: boolean;
    label: label;
}

export const decideDownlodingTool = async ({ statusMessage, mediaId, url, platform, label, skipUserBot = false }: decideDownlodingToolProp) => {
    let downloadingTool: downloadingTools;
    const chatId = statusMessage?.chat?.id;
    const messageId = statusMessage?.message_id;

    try {
        if (!chatId || !messageId) {
            throw new Error("Invalid statusMessage: missing chatId or messageId");
        }

        if (userBotPlatforms.includes(platform) && env.INCLUDE_USERBOT && !skipUserBot) {
            downloadingTool = "user-bot";
            await sendUrlToTargetBot({ statusMessage, url, mediaId, platform, label });
            return;
        } else if (galleryDlPlatforms.includes(platform)) {
            downloadingTool = "gallery-dl";
        } else {
            downloadingTool = "yt-dlp";
        }

        await downloadQueue.add('download-task', {
            chatId,
            messageId,
            mediaId,
            url,
            platform,
            label,
            downloadingTool
        });

        await bot.api.editMessageText(
            chatId,
            messageId,
            "⏳ *Added to queue...*",
            { parse_mode: "Markdown" }
        ).catch((error) => {
            console.error(`[Decider] Failed to edit status message: ${error.message || error}`);
        });
    } catch (error: any) {
        const errorMessage = error.message || error
        console.error(`[Decider] Failed to add a job queue: ${errorMessage}`);
        await sendMediaErrorMessage({ chatId, messageId, label, errorMessage })
        notifyAdminError(error, 'decideDownlodingTool');
    }
};


export const handleMediaDownload = async ({ url, ctx, label, skipYoutubeCheck }: handleMediaDownloadProp) => {

    let statusMessage: Message.TextMessage | undefined;
    try {
        statusMessage = await ctx.reply("🔍 *Receiving metadata...*", { parse_mode: 'Markdown' });

        let fullUrl = url
        let platform = identifyPlatformType(fullUrl)
        let mediaId = extractMediaId({ url: fullUrl, platform });
        if (!mediaId) {
            fullUrl = await resolveFullUrl(url)
            platform = identifyPlatformType(fullUrl);
            mediaId = extractMediaId({ url: fullUrl, platform });
        }


        if (platform === "youtube" && mediaId && !skipYoutubeCheck) {
            await sendYoutubeQualityOptions({ videoId: mediaId, statusMessage });
            return;
        }


        if (mediaId) {
            const mediaKey = `media:${platform}:${mediaId}`;
            const cachedMedia = await getCachedItem(mediaKey);

            if (cachedMedia) {
                const parsed: CachedMediaData = JSON.parse(cachedMedia);
                const chatId = statusMessage.chat.id;
                const messageId = statusMessage.message_id;

                if (parsed.mediaGroup && parsed.mediaGroup.length > 0) {
                    await sendGroupMedia({
                        chatId,
                        messageId,
                        items: parsed.mediaGroup,
                    });
                    return;
                }

                const fileId = parsed.formats?.[label];
                if (fileId) {
                    await sendSingleMedia({ chatId, messageId, source: fileId, label });
                    return;
                }
            }
        }

        const userId = ctx.from?.id;
        const userData = await checkRateLimit(userId!)
        if (!userData.allowed) {
            return await sendRateLimitedMessage({ chatId: statusMessage.chat.id, messageId: statusMessage.message_id, userData })
        }

        // Download via selected tool if not served from cache
        await decideDownlodingTool({ mediaId, platform, url: fullUrl, label, statusMessage });

    } catch (error: any) {
        console.error(`[Video Handler] Failed to handle media download: ${error.message || error}`);
        if (statusMessage) {
            await sendMediaErrorMessage({
                chatId: statusMessage?.chat?.id,
                messageId: statusMessage?.message_id,
                label,
                errorMessage: error.message || error
            });
        }
        notifyAdminError(error, 'handleMediaDownload');
    }
}