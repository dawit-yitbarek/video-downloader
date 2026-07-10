import { bot } from "../utils/telegram.js";
import { DOWNLOAD_LIMIT } from "../config/constants.js";
import { checkDownloadLimit } from "../helpers/rateLimit.js";
import { joinedTelegram } from "../utils/telegram.js";
import { getVideoMetaData } from "../helpers/getVideoMeta.js";
import { sendMetadata } from "../utils/metadataPresenter.js";
import { addVideoJob } from "../helpers/videoQueue.js";
import { downloadCache } from "../utils/metadataPresenter.js";
import logger from "../utils/logger.js";
import { sendCachedVideoData, getCachedMetadata, cacheMetadata } from "../helpers/sendFromCache.js";

export const isYoutube = (url) => {
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const pathname = parsedUrl.pathname;

        const isYoutubeDomain = hostname.includes("youtube.com") || hostname.includes("youtu.be");
        const isShort = pathname.startsWith("/shorts/");

        return isYoutubeDomain && !isShort;
    } catch (e) {
        return false;
    }
};

export const isPinterest = (url) => {
    return url.includes("pinterest.com") || url.includes("pin.it");
};

export const initBotHandlers = () => {

    bot.start((ctx) => {
        // Dynamically get the user's first name from the context
        const firstName = ctx.from?.first_name || "there";

        const welcomeMessage =
            `👋 *Welcome, ${firstName}!*\n\n` +
            `I am Social media videos downloader bot. I can download videos from your favorite platforms:\n\n` +
            `🎬 *TikTok*\n` +
            `📸 *Instagram*\n` +
            `📺 *YouTube*\n` +
            `... and many more!\n\n` +
            `🚀 *How to use:* Just send me a video link directly or share the video to this bot from the app, and I will send you high-quality video!\n\n` +
            `📖 Want to see the full list of supported platforms? Type /help`

        return ctx.reply(welcomeMessage, {
            parse_mode: "Markdown"
        });
    });


    bot.command("help", (ctx) => {
        const helpMessage =
            `📖 * How to Download Videos *\n\n` +
            `You can download media in two simple ways:\n` +
            `1️⃣ * Direct Paste:* Copy the video URL from your browser or app and paste it directly into this chat.\n` +
            `2️⃣ * Direct Share:* Click the ** "Share" ** button on the app you are watching(like TikTok or Instagram), choose Telegram, and select this bot as the recipient.\n\n\n` +
            `📊 * Supported Platforms List *\n\n` +
            `\`•TikTok     •YouTube    •Snapchat\`\n` +
            `\`•Instagram  •Twitter(X) •LinkedIn\`\n` +
            `\`•Facebook   •Pinterest\`\n\n` +
            `🚀 * Tip:* You can download upto ${DOWNLOAD_LIMIT} video per 24 hour!`

        return ctx.reply(helpMessage, {
            parse_mode: "Markdown"
        });
    });


    bot.command("status", async (ctx) => {
        try {
            const { remaining, resetIn } = await checkDownloadLimit(ctx.from.id);
            const used = DOWNLOAD_LIMIT - remaining

            let resetText = "Your quota will reset 24 hours after your first download.";
            if (resetIn && resetIn > 0) {
                const hoursLeft = Math.floor(resetIn / 3600);
                const minutesLeft = Math.ceil((resetIn % 3600) / 60);

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
        } catch (err) {
            logger.error(`Error on status command handler: ${err}`);
            await ctx.reply("⚠️ Unable to fetch your quota status right now. Please try again later.");
        }
    });


    bot.hears(/(https?:\/\/[^\s]+)/, async (ctx) => {

        if (!await joinedTelegram(ctx)) return;
        let initialMsg = null;

        try {
            const videoUrlFromUser = ctx.match[0];

            if (!isYoutube(videoUrlFromUser)) {
                const isVideoCached = await sendCachedVideoData(ctx.chat.id, "best", videoUrlFromUser);
                if (isVideoCached) {
                    logger.info(`✅ Video sent from cache for URL: ${videoUrlFromUser}`);
                    return;
                }
            }

            const downloadLimit = await checkDownloadLimit(ctx.from.id);
            if (!downloadLimit.allowed) {
                const hoursLeft = Math.floor(downloadLimit.resetIn / 3600);
                const minutesLeft = Math.ceil((downloadLimit.resetIn % 3600) / 60);

                const timeLeftStr = hoursLeft > 0
                    ? `* ${hoursLeft}h ${minutesLeft} m * `
                    : `* ${minutesLeft} minutes * `;

                return ctx.reply(
                    `❌ * Daily Download Limit Reached *\n\n` +
                    `You have used all your video downloads for this 24 - hour window.\n\n` +
                    `⏳ Your quota will unlock in ${timeLeftStr}.`,
                    { parse_mode: "Markdown" }
                );
            }

            if (isYoutube(videoUrlFromUser)) {
                initialMsg = await ctx.reply("⏳ Receiving metadata...");
                const cachedMetadata = await getCachedMetadata(videoUrlFromUser);
                if (cachedMetadata) {
                    return sendMetadata(ctx, cachedMetadata, initialMsg, videoUrlFromUser);
                }
                const videoData = await getVideoMetaData(videoUrlFromUser)

                // Immediately trigger background caching (Fire-and-forget)
                cacheMetadata(videoUrlFromUser, videoData).catch(() => { });

                return sendMetadata(ctx, videoData, initialMsg, videoUrlFromUser)
            }

            initialMsg = await ctx.reply("⏳ Your request is queued...");

            // Add the job to the Redis/BullMQ queue 
            // Absolute best quality for non-pinterest video -- "best[ext=mp4]/best[vcodec!=none][acodec!=none]/best"
            const format = isPinterest(videoUrlFromUser) ? "bv*+ba/b" : "best[ext=mp4]/best";
            await addVideoJob(ctx.chat.id, ctx.from.id, initialMsg.message_id, videoUrlFromUser, format, "mp4", "", false, "best");
        } catch (error) {
            logger.error(`Error on link text handler: ${error}`);
            if (initialMsg && initialMsg.message_id) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    initialMsg.message_id,
                    null,
                    "❌ Service temporarily unavailable. Please try again later.",
                    { parse_mode: "Markdown" }
                );
            } else {
                await ctx.reply("❌ Service temporarily unavailable. Please try again later.");
            }
        }
    });


    bot.action(/^dl:(.+)$/, async (ctx) => {
        try {
            const cacheId = ctx.match[1] || ctx.callbackQuery.data.split(":");
            const downloadConfig = downloadCache.get(cacheId);

            if (!downloadConfig) {
                return ctx.answerCbQuery("This download session has expired. Please try again.", { show_alert: true });
            }

            // Stops the telegram button spinner instantly and silently
            await ctx.answerCbQuery();

            const { label, format, url, ext, title, isAudio } = downloadConfig;

            const isVideoCached = await sendCachedVideoData(ctx.chat.id, label, url);
            if (isVideoCached) {
                downloadCache.delete(cacheId);
                logger.info(`✅ Video sent from cache for URL: ${url}`);
                return;
            }

            const initialMsg = await ctx.reply("⏳ Your request is queued...");

            await addVideoJob(ctx.chat.id, ctx.from.id, initialMsg.message_id, url, format, ext, title, isAudio, label);

            downloadCache.delete(cacheId);

        } catch (error) {
            logger.error(`Error in callback handler: ${error}`);
            await ctx.reply("❌ Service temporarily unavailable. Please try again later.");
            try { await ctx.answerCbQuery(); } catch (_) { }
        }
    });


    // Catch-all
    bot.on("text", (ctx) => {
        const welcomeMessage =
            `I am Social media videos downloader bot. I can download videos from your favorite platforms:\n\n` +
            `🎬 *TikTok*\n` +
            `📸 *Instagram*\n` +
            `📺 *YouTube*\n` +
            `... and many more!\n\n` +
            `🚀 *How to use:* Just send me a video link directly or share the video to this bot from the app, and I will send you high-quality video!\n\n` +
            `📖 Want to see the full list of supported platforms? Type /help`

        return ctx.reply(welcomeMessage, {
            parse_mode: "Markdown"
        });
    });
};