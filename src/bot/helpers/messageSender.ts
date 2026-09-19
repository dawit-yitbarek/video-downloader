import { Context, InlineKeyboard, InputFile } from "grammy";
import type { Message, InputMediaPhoto, InputMediaVideo } from "grammy/types";
import fs from "fs";
import { DOWNLOAD_LIMIT } from "../../config/constants.js";
import { checkRateLimit, type RateLimitResult, type MediaGroupItem } from "../../services/redis.service.js";
import { getYouTubeData } from "../../utils/getYouTubeData.js";
import type { downloadingTools, label } from "../../types/index.js";
import { bot } from "../index.js";
import { chunkArray } from "../../utils/chunkArray.js";
import { notifyAdminError } from "../../utils/logger.js";

interface singleMediaDataProp {
    chatId: number
    messageId: number
    source: string
    label: label
    duration?: number | undefined;
    thumbnailPath?: string | undefined;
};

interface RateLimitMessageProp {
    chatId: number
    messageId: number
    userData: RateLimitResult
};

interface sendMediaGroupProp {
    chatId: number;
    messageId: number;
    items: MediaGroupItem[];
}

export const sendYoutubeQualityOptions = async ({ videoId, statusMessage }: { videoId: string, statusMessage: Message.TextMessage }) => {
    try {
        if (!videoId) {
            throw new Error("Video Id not provided in sendYoutubeQualityOptions")
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`
        const keyboard = new InlineKeyboard();
        const videoQualities: label[] = ["360p", "480p", "720p", "1080p"]

        videoQualities.forEach((q, index) => {
            keyboard.text(`🎬 ${q}`, `dl:${url}:${q}`);

            // Push to a new row every 2 buttons
            if ((index + 1) % 2 === 0) {
                keyboard.row();
            }
        });

        if (videoQualities.length % 2 !== 0) {
            keyboard.row();
        }
        keyboard.text(`🎵 Audio`, `dl:${url}:audio`);

        const youtubeData = await getYouTubeData(url)
        const cleanTitle = youtubeData?.title ? youtubeData.title.replace(/[*_`[\]]/g, '') : "Untitled Media";
        const textCaption = `🎥 *${cleanTitle}* \n\n⚡ *Select your preferred file format below to begin downloading:*`;

        if (youtubeData?.thumbnail) {
            await bot.api.deleteMessage(statusMessage.chat.id, statusMessage.message_id).catch((error) => {
                console.error(`[MessageHelper] ⚠️ Non-fatal: Could not delete initial message card: ${error?.message || error}`)
            })

            await bot.api.sendPhoto(statusMessage.chat.id, new InputFile(youtubeData.thumbnail, "thumbnail.jpg"), {
                caption: textCaption,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            })
        } else {
            await bot.api.editMessageText(
                statusMessage.chat.id,
                statusMessage.message_id,
                textCaption,
                { parse_mode: "Markdown", reply_markup: keyboard }
            )
        }
    } catch (error: any) {
        const errorMessage = error.message || error
        await sendMediaErrorMessage({
            chatId: statusMessage.chat.id,
            messageId: statusMessage.message_id,
            errorMessage
        })
        console.error(`[MessageHelper] Error sending youtube data: ${errorMessage}`)
        notifyAdminError(error, 'sendYoutubeQualityOptions');
    }
};

export const sendSingleMedia = async ({ chatId, messageId, source, label, thumbnailPath, duration }: singleMediaDataProp): Promise<string> => {
    try {
        let mediaSource: string = source;
        let sentFileId: string;
        const BOT_USERNAME = bot.botInfo.username;

        if (fs.existsSync(mediaSource)) {
            mediaSource = `file://${source}`
        }

        let thumbnailFile: InputFile | undefined = undefined;
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            thumbnailFile = new InputFile(thumbnailPath);
        }

        const keyboard = new InlineKeyboard().switchInline(
            "Share ⬆️",
            "Check out this downloader!"
        );
        const caption = `🚀 Downloaded with @${BOT_USERNAME}\n\n🥰 Enjoy! Don't forget to share it with your friends.`

        // Build optional media properties cleanly
        const extraOptions = {
            ...(duration && { duration }),
            ...(thumbnailFile && { thumbnail: thumbnailFile }),
        };

        if (label === "audio") {
            const audioMessage = await bot.api.sendAudio(chatId, mediaSource, {
                caption: `@${BOT_USERNAME}`,
                title: "Audio",
                reply_markup: keyboard,
                ...extraOptions,
            });
            sentFileId = audioMessage.audio.file_id;
        } else {
            const videoMessage = await bot.api.sendVideo(chatId, mediaSource, {
                caption,
                supports_streaming: true,
                reply_markup: keyboard,
                ...extraOptions,
            });
            sentFileId = videoMessage.video.file_id;
        }

        try {
            await bot.api.deleteMessage(chatId, messageId);
        } catch (error: any) {
            console.warn(`[MessageHelper] ⚠️ Non-fatal: Could not delete initial message card: ${error.message || error}`);
        }

        return sentFileId;
    } catch (error: any) {
        throw new Error(`[MessageHelper] failed to send media: ${error?.message || error}`)
    }
};

export const sendGroupMedia = async ({
    chatId,
    messageId,
    items,
}: sendMediaGroupProp): Promise<MediaGroupItem[]> => {
    try {
        const BOT_USERNAME = bot.botInfo.username;
        const caption = `🚀 Downloaded with @${BOT_USERNAME}\n\n🥰 Enjoy! Don't forget to share it with your friends.`;
        const keyboard = new InlineKeyboard().switchInline(
            "Share ⬆️",
            "Check out this downloader!"
        );

        const resultCacheItems: MediaGroupItem[] = [];
        if (items.length === 0) {
            throw new Error("No media items provided to sendGroupMedia");
        }

        // 1. Single Item Handling
        if (items.length === 1) {
            const item = items[0]!;
            const mediaSource = fs.existsSync(item.fileSource) ? `file://${item.fileSource}` : item.fileSource;

            if (item.type === 'photo') {
                const msg = await bot.api.sendPhoto(chatId, mediaSource, { caption, reply_markup: keyboard });
                resultCacheItems.push({ fileSource: msg.photo.at(-1)!.file_id, type: 'photo' });
            } else {
                const msg = await bot.api.sendVideo(chatId, mediaSource, { caption, reply_markup: keyboard, supports_streaming: true });
                resultCacheItems.push({ fileSource: msg.video.file_id, type: 'video' });
            }
        } else {
            // Telegram sendMediaGroup limits: max 10 items per group batch
            const batches = chunkArray(items, 10);

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex]!;

                const mediaGroup: (InputMediaPhoto | InputMediaVideo)[] = batch.map((item, index) => {
                    const mediaSource = fs.existsSync(item.fileSource)
                        ? `file://${item.fileSource}`
                        : item.fileSource;

                    return {
                        type: item.type,
                        media: mediaSource,
                        // Attach caption ONLY to the very first item of the very first batch
                        ...(batchIndex === 0 && index === 0 && { caption }),
                    } as InputMediaPhoto | InputMediaVideo;
                });

                // Send the current batch to Telegram
                const sentMessages = await bot.api.sendMediaGroup(chatId, mediaGroup);

                // Collect file_ids from this batch into resultCacheItems
                for (const msg of sentMessages) {
                    if ('photo' in msg && msg.photo) {
                        const highestRes = msg.photo.at(-1)!;
                        resultCacheItems.push({ fileSource: highestRes.file_id, type: 'photo' });
                    } else if ('video' in msg && msg.video) {
                        resultCacheItems.push({ fileSource: msg.video.file_id, type: 'video' });
                    }
                }
            }
        }


        try {
            await bot.api.deleteMessage(chatId, messageId);
        } catch (error: any) {
            console.warn(`[MessageHelper] ⚠️ Non-fatal: Could not delete status card: ${error.message || error}`);
        }

        return resultCacheItems;
    } catch (error: any) {
        throw new Error(`[MessageHelper] failed to send media group: ${error?.message || error}`);
    }
};

export const sendRateLimitedMessage = async ({ chatId, messageId, userData }: RateLimitMessageProp) => {
    try {

        const hoursLeft = Math.floor(userData.resetInSeconds / 3600);
        const minutesLeft = Math.ceil((userData.resetInSeconds % 3600) / 60);

        const timeLeftStr = hoursLeft > 0
            ? `* ${hoursLeft}h ${minutesLeft} m * `
            : `* ${minutesLeft} minutes * `;

        return bot.api.editMessageText(
            chatId,
            messageId,
            `❌ * Daily Download Limit Reached *\n\n` +
            `You have used all your downloads for this 24 - hour window.\n\n` +
            `⏳ Your quota will unlock in ${timeLeftStr}.`,
            { parse_mode: "Markdown" }
        );

    } catch (error: any) {
        console.error(`[MessageHelper] Failed to send ratelimit message ${error?.message || error}`)
        notifyAdminError(error, 'sendRateLimitedMessage');
    }
};

export const sendStatusMessage = async ({ ctx }: { ctx: Context }) => {
    try {
        const userId = ctx.from?.id;
        if (!userId) return;
        const { remaining, resetInSeconds, fetchFailed } = await checkRateLimit(userId);
        if (fetchFailed) {
            await ctx.reply("⚠️ Unable to fetch your quota status right now. Please try again later.");
            return;
        }

        const used = DOWNLOAD_LIMIT - remaining

        let resetText = "Your quota will reset 24 hours after your first download.";
        if (resetInSeconds && resetInSeconds > 0) {
            const hoursLeft = Math.floor(resetInSeconds / 3600);
            const minutesLeft = Math.ceil((resetInSeconds % 3600) / 60);

            resetText = hoursLeft > 0
                ? `🕒 * Quota Resets In:* ${hoursLeft}h ${minutesLeft} m`
                : `🕒 * Quota Resets In:* ${minutesLeft} minutes`;
        }

        const statusMessage =
            `📊 * Your Daily Download Status *\n\n` +
            `• Used Today: * ${used} / ${DOWNLOAD_LIMIT}*\n` +
            `• Remaining: * ${remaining}*\n\n` +
            `${resetText}`

        await ctx.reply(statusMessage, { parse_mode: "Markdown" });
    } catch (error: any) {
        console.error(`[MessageHelper] Failed to send status message ${error?.message || error}`)
        notifyAdminError(error, 'sendStatusMessage');
    }
};

export const sendStartMessage = async ({ ctx }: { ctx: Context }) => {
    try {
        const firstName = ctx.from?.first_name || "there";
        const welcomeMessage =
            `👋 *Welcome, ${firstName}!*\n\n` +
            `I am your **Social Media Downloader Bot**. I can download high-quality **videos, photo posts, carousels, and images** from your favorite platforms:\n\n` +
            `🎬 *TikTok* (Videos & Photo Slideshows)\n` +
            `📸 *Instagram* (Reels, Posts & Photos)\n` +
            `📺 *YouTube* (Videos & Shorts)\n` +
            `📌 *Pinterest* (Videos & Pins)\n` +
            `... and many more!\n\n` +
            `🚀 *How to use:* Just send or share a link to any post, photo, or video, and I will extract the media for you!\n\n` +
            `📖 Want to see all supported platforms? Type /help`;

        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    } catch (error: any) {
        console.error(`[MessageHelper] Failed to send start message ${error?.message || error}`);
        notifyAdminError(error, 'sendStartMessage');
    }
};

export const sendHelpMessage = async ({ ctx }: { ctx: Context }) => {
    try {
        const helpMessage =
            `📖 *How to Download Media*\n\n` +
            `You can download videos, photos, and carousels in two simple ways:\n` +
            `1️⃣ *Direct Paste:* Copy the link from your browser or app and paste it directly into this chat.\n` +
            `2️⃣ *Direct Share:* Click the **Share** button on the app (like TikTok, Instagram, or Pinterest), select Telegram, and pick this bot.\n\n` +
            `📊 *Supported Platforms*\n\n` +
            `\`• TikTok (Videos & Photos)   • YouTube\`\n` +
            `\`• Instagram (Reels & Posts)   • Twitter (X)\`\n` +
            `\`• Pinterest (Videos & Pins)   • Facebook\`\n` +
            `\`• Snapchat                    • LinkedIn\`\n\n` +
            `🚀 *Tip:* You can download up to ${DOWNLOAD_LIMIT} *new* media items per 24 hours. However, if a video has already been downloaded by anyone using this bot before, it won't count toward your daily limit!`;

        return ctx.reply(helpMessage, {
            parse_mode: "Markdown"
        });
    } catch (error: any) {
        console.error(`[MessageHelper] Failed to send help message ${error?.message || error}`);
        notifyAdminError(error, 'sendHelpMessage');
    }
};

export const sendTextMessage = async ({ ctx }: { ctx: Context }) => {
    try {
        const welcomeMessage =
            `I am your **Social Media Downloader Bot**. I can download high-quality **videos, photo posts, carousels, and images** from your favorite platforms:\n\n` +
            `🎬 *TikTok* (Videos & Photo Slideshows)\n` +
            `📸 *Instagram* (Reels, Posts & Photos)\n` +
            `📺 *YouTube* (Videos & Shorts)\n` +
            `📌 *Pinterest* (Videos & Pins)\n` +
            `... and many more!\n\n` +
            `🚀 *How to use:* Just send or share a link to any post, photo, or video, and I will extract the media for you!\n\n` +
            `📖 Want to see all supported platforms? Type /help`;

        return ctx.reply(welcomeMessage, {
            parse_mode: "Markdown"
        });
    } catch (error: any) {
        console.error(`[MessageHelper] Failed to send text message ${error?.message || error}`)
        notifyAdminError(error, 'sendTextMessage');
    }
};

export const sendMediaErrorMessage = async ({ chatId, messageId, label, errorMessage, downloadingTool }: { chatId: number, messageId: number, label?: label, downloadingTool?: downloadingTools, errorMessage: string | undefined }) => {
    try {
        if (!chatId || !messageId) {
            throw new Error("chatId or messageId doesn't provide on sendMediaErrorMessage")
        }

        const itemToSend = downloadingTool === 'gallery-dl' ? 'post' : (label === 'audio' ? 'Audio' : 'Video');
        const message = errorMessage?.includes("DOWNLOAD_TIMEOUT")
            ? `❌ *Download Timed Out*\n\nThe ${itemToSend} is either too large or the platform is responding too slowly. Please try again with a shorter ${itemToSend}.`
            : `❌ *Download Failed*\n\n` +
            `We couldn't process this ${itemToSend} link. This usually happens if:\n` +
            `• The ${itemToSend} is private, age-restricted, or deleted.\n` +
            `• The link format is incorrect or broken.\n` +
            `• The platform is experiencing temporary downtime.\n\n` +
            `*What to do:* Please double-check that the ${itemToSend} is public and try copying the link again. If it keeps failing, try a different link or try again in a few minutes!`

        await bot.api.editMessageText(
            chatId,
            messageId,
            message,
            { parse_mode: "Markdown" }
        )
    } catch (error: any) {
        console.error(`[MessageHelper] Failed to send media error message: ${error?.message || error}`)
        notifyAdminError(error, 'sendMediaErrorMessage');
    }
};