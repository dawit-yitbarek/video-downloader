import { Queue } from 'bullmq';
import { REDIS_URL, CHANNEL_ID } from './src/config/env.js';
import { joinedTelegram, bot, sendMetadata, downloadCache } from './src/utils/telegram.js';
import { getVideoMetaData } from './src/helpers/getVideoMeta.js';
import { checkAndIncreaseAttempt, checkDownloadLimit } from './src/helpers/rateLimit.js';
import { redis } from './src/utils/redis.js';
import { DOWNLOAD_LIMIT, COOKIE_PATH } from './src/config/constants.js';

const connection = { url: REDIS_URL };

// Create a queue instance
const videoQueue = new Queue('videoQueue', { connection });

// Function to add a new job to the queue
async function addVideoJob(chatId, messageId, videoUrl, userId, format, ext, title, isAudio) {
    await videoQueue.add('processVideo', {
        chatId,
        messageId,
        videoUrl,
        userId,
        format,
        ext,
        title,
        isAudio
    });
}

const isYoutube = (url) => {
    return url.includes("youtu.be") || url.includes("youtube.com")
};

const isPinterest = (url) => {
    return url.includes("pinterest.com") || url.includes("pin.it");
};

bot.start((ctx) => {
    // Dynamically get the user's first name from the context
    const firstName = ctx.from?.first_name || "there";

    const welcomeMessage =
        `👋 *Welcome, ${firstName}!*

I am Social media videos downloader bot. I can download videos from your favorite platforms:

🎬 *TikTok*
📸 *Instagram*
📺 *YouTube*
... and many more!

🚀 *How to use:* Just send me a video link directly or share the video to this bot from the app, and I will send you high-quality video!

📖 Want to see the full list of supported platforms? Type /help`;

    return ctx.reply(welcomeMessage, {
        parse_mode: "Markdown"
    });
});


bot.command("help", (ctx) => {
    const helpMessage =
        `📖 *How to Download Videos*

You can download media in two simple ways:
1️⃣ *Direct Paste:* Copy the video URL from your browser or app and paste it directly into this chat.
2️⃣ *Direct Share:* Click the **"Share"** button on the app you are watching (like TikTok or Instagram), choose Telegram, and select this bot as the recipient.


📊 *Supported Platforms List*

\`•TikTok     •YouTube    •Snapchat\`
\`•Instagram  •Twitter(X) •LinkedIn\`
\`•Facebook   •Pinterest\`

🚀 *Tip:* You can download upto ${DOWNLOAD_LIMIT} video per 24 hour!`;

    return ctx.reply(helpMessage, {
        parse_mode: "Markdown"
    });
});

bot.command("status", async (ctx) => {
    try {
        const { remaining, resetIn } = await checkDownloadLimit(redis, ctx.from.id);
        const used = DOWNLOAD_LIMIT - remaining

        let resetText = "Your quota will reset 24 hours after your first download.";
        if (resetIn && resetIn > 0) {
            const hoursLeft = Math.floor(resetIn / 3600);
            const minutesLeft = Math.ceil((resetIn % 3600) / 60);

            resetText = hoursLeft > 0
                ? `🕒 *Quota Resets In:* ${hoursLeft}h ${minutesLeft}m`
                : `🕒 *Quota Resets In:* ${minutesLeft} minutes`;
        }

        const statusMessage =
            `📊 *Your Daily Download Status*

• Used Today: *${used} / ${DOWNLOAD_LIMIT}*
• Remaining: *${remaining}*

${resetText}`;

        await ctx.reply(statusMessage, { parse_mode: "Markdown" });
    } catch (err) {
        console.error(err);
        await ctx.reply("⚠️ Unable to fetch your quota status right now. Please try again later.");
    }
});


bot.hears(/(https?:\/\/[^\s]+)/, async (ctx) => {

    if (!await joinedTelegram(ctx)) return;

    try {
        const attempt = await checkAndIncreaseAttempt(redis, ctx.from.id);
        if (!attempt.allowed) {
            const hoursLeft = Math.floor(attempt.resetIn / 3600);
            const minutesLeft = Math.ceil((attempt.resetIn % 3600) / 60);

            const timeLeftStr = hoursLeft > 0
                ? `*${hoursLeft}h ${minutesLeft}m*`
                : `*${minutesLeft} minutes*`;

            return ctx.reply(
                `🛑 *Request Limit Reached*\n\n` +
                `You have exceeded the maximum allowed download attempts for today.\n\n` +
                `⏳ Please try again in ${timeLeftStr}.`,
                { parse_mode: "Markdown" }
            );
        }

        const downloadLimit = await checkDownloadLimit(redis, ctx.from.id);
        if (!downloadLimit.allowed) {
            const hoursLeft = Math.floor(downloadLimit.resetIn / 3600);
            const minutesLeft = Math.ceil((downloadLimit.resetIn % 3600) / 60);

            const timeLeftStr = hoursLeft > 0
                ? `*${hoursLeft}h ${minutesLeft}m*`
                : `*${minutesLeft} minutes*`;

            return ctx.reply(
                `❌ *Daily Download Limit Reached*\n\n` +
                `You have used all your video downloads for this 24-hour window.\n\n` +
                `⏳ Your quota will unlock in ${timeLeftStr}.`,
                { parse_mode: "Markdown" }
            );
        }

        const videoUrlFromUser = ctx.match[0];

        if (isYoutube(videoUrlFromUser)) {
            const metadataMsg = await ctx.reply("⏳ Receiving metadata...");
            const videoData = await getVideoMetaData(videoUrlFromUser, COOKIE_PATH)
            return sendMetadata(ctx, videoData, metadataMsg, videoUrlFromUser)
        }

        const initialMsg = await ctx.reply("⏳ Your request is queued...");

        // Add the job to the Redis/BullMQ queue 
        const format = isPinterest(videoUrlFromUser) ? "bv*+ba/b" : "best[ext=mp4]/best";
        await addVideoJob(ctx.chat.id, initialMsg.message_id, videoUrlFromUser, ctx.from.id, format, "mp4", "", false);
        console.log(`Job queued: ${videoUrlFromUser}`);

    } catch (error) {
        console.error("Error on link text handler:", error);
        await ctx.reply("❌ Service temporarily unavailable. Please try again later.");
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

        const { format, url, ext, title, isAudio } = downloadConfig;

        const initialMsg = await ctx.reply("⏳ Your request is queued...");

        // 4. Pass the existing message ID to your queue
        await addVideoJob(ctx.chat.id, initialMsg.message_id, url, ctx.from.id, format, ext, title, isAudio);

        downloadCache.delete(cacheId);

    } catch (error) {
        console.error("Error in callback handler:", error);
        await ctx.reply("❌ Service temporarily unavailable. Please try again later.");
        try { await ctx.answerCbQuery(); } catch (_) { }
    }
});



// Catch-all
bot.on("text", (ctx) => {
    const welcomeMessage =
        `
I am Social media videos downloader bot. I can download videos from your favorite platforms:

🎬 *TikTok*
📸 *Instagram*
📺 *YouTube*
... and many more!

🚀 *How to use:* Just send me a video link directly or share the video to this bot from the app, and I will send you high-quality video!

📖 Want to see the full list of supported platforms? Type /help`;

    return ctx.reply(welcomeMessage, {
        parse_mode: "Markdown"
    });
});