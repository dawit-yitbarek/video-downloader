import { Queue } from 'bullmq';
import { REDIS_URL, CHANNEL_ID } from './src/config/env.js';
import { joinedTelegram, bot } from './src/utils/telegram.js';
import { checkAndIncreaseAttempt, checkDownloadLimit } from './src/helpers/rateLimit.js';
import { redis } from './src/utils/redis.js';
import { DOWNLOAD_LIMIT } from './src/config/constants.js';

const connection = { url: REDIS_URL };

// Create a queue instance
const videoQueue = new Queue('videoQueue', { connection });

// Function to add a new job to the queue
async function addVideoJob(chatId, messageId, videoUrl, userId) {
    await videoQueue.add('processVideo', {
        chatId,
        messageId,
        videoUrl,
        userId
    });
}

bot.start((ctx) => ctx.reply(
    "👋 Welcome! I can download videos from TikTok, Instagram, YouTube, Twitter, Facebook and Pinterest.\n\nJust send me a link and I will download it 🚀",
    { parse_mode: "Markdown" }
));

bot.command("help", (ctx) =>
    ctx.reply(
        `📘 *How to Use*\n\n` +
        `• Send any video link\n` +
        `• You must join our [telegram channel](https://t.me/${CHANNEL_ID.replace("@", "")})\n` +
        `• You can download upto ${DOWNLOAD_LIMIT} videos daily`,
        { parse_mode: "Markdown" }
    )
);

bot.command("status", async (ctx) => {
    try {
        const { remaining } = await checkDownloadLimit(redis, ctx.from.id);

        await ctx.reply(
            `*Your Download Status*\n\n` +
            `Downloads used today: *${DOWNLOAD_LIMIT - remaining}*\n` +
            `Remaining downloads: *${remaining}*\n`,
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        console.error(err);
        await ctx.reply("⚠️ Unable to fetch your status right now. Please try again later.");
    }
});


bot.hears(/(https?:\/\/[^\s]+)/, async (ctx) => {

    if (!await joinedTelegram(ctx)) return;

    try {
        const attempt = await checkAndIncreaseAttempt(redis, ctx.from.id);
        if (!attempt.allowed) {

            return ctx.reply(
                `❌ Daily request limit reached.\nTry again in ${Math.ceil(attempt.resetIn / 3600)}h`,
                { parse_mode: "Markdown" }
            );
        }

        const downloadLimit = await checkDownloadLimit(redis, ctx.from.id);
        if (!downloadLimit.allowed) {
            await ctx.reply(
                `❌ Daily download limit reached.\nTry again in ${Math.ceil(downloadLimit.resetIn / 3600)}h`
            );
            return;
        }
        const videoUrlFromUser = ctx.match[0];
        const initialMsg = await ctx.reply("⏳ Your request is queued...");

        // Add the job to the Redis/BullMQ queue 
        await addVideoJob(ctx.chat.id, initialMsg.message_id, videoUrlFromUser, ctx.from.id);
        console.log(`Job queued: ${videoUrlFromUser}`);

    } catch (error) {
        console.error("Error processing request:", error);
        await ctx.reply("❌ Service temporarily unavailable. Please try again later.");
    }
});

// Catch-all
bot.on("text", (ctx) => ctx.reply("Send me any video link — I will download it 🚀"));