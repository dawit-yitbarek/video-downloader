import { Worker } from "bullmq";
import fs from "fs";
import { spawn } from "child_process";
import { YTDLP_COOKIES, REDIS_URL, BOT_USERNAME } from "./src/config/env.js";
import { getVideoMetaData } from "./src/helpers/getVideoMeta.js";
import { COOKIE_PATH } from "./src/config/constants.js";
import { redis } from "./src/utils/redis.js";
import { checkDownloadLimit, increaseDownloadCount } from "./src/helpers/rateLimit.js";
import { telegram, sendMetadata } from "./src/utils/telegram.js";
import { text } from "stream/consumers";
import { Markup } from "telegraf";

const connection = { url: REDIS_URL };

const worker = new Worker(
    "videoQueue",
    async job => {
        const { chatId, messageId, videoUrl, userId, format, ext, title, isAudio } = job.data;
        let ytdlp = null;
        let downloadTimeout = null;

        try {
            const downloadLimit = await checkDownloadLimit(redis, userId);
            if (!downloadLimit.allowed) {
                const hoursLeft = Math.floor(downloadLimit.resetIn / 3600);
                const minutesLeft = Math.ceil((downloadLimit.resetIn % 3600) / 60);

                const timeLeftStr = hoursLeft > 0
                    ? `*${hoursLeft}h ${minutesLeft}m*`
                    : `*${minutesLeft} minutes*`;

                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    `❌ *Daily Download Limit Reached*\n\n` +
                    `You have used all your video downloads for this 24-hour window.\n\n` +
                    `⏳ Your quota will unlock in ${timeLeftStr}.`,
                    { parse_mode: "Markdown" }
                );
                return;
            }

            await telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                `🚀 Downloading & sending ${isAudio ? 'Audio' : 'Video'}...`
            );

            try {
                const ytdlpArgs = [
                    "-f", format,
                    "--cookies", COOKIE_PATH,
                    "--js-runtimes", "node",
                    "--remote-components", "ejs:github",
                    "-o", "-",
                    videoUrl
                ];

                // If it's a combined YouTube track (contains a '+'), force the merge container format
                if (format.includes("+")) {
                    ytdlpArgs.push("--merge-output-format", ext);
                }

                const ytdlp = spawn("yt-dlp", ytdlpArgs);

                ytdlp.stderr.pipe(process.stderr);

                // Timeout for download process only (5 minutes)
                downloadTimeout = setTimeout(() => {
                    if (ytdlp && !ytdlp.killed) {
                        console.warn(`⏱️ Download timeout for URL: ${videoUrl}`);
                        ytdlp.kill("SIGKILL");
                    }
                }, 300000);

                const filename = `file_${Date.now()}.${ext}`;
                if (isAudio) {
                    await telegram.sendAudio(chatId, {
                        source: ytdlp.stdout,
                        filename: filename
                    }, {
                        caption: `${BOT_USERNAME}`,
                        title: title,
                    });
                } else {
                    await telegram.sendVideo(chatId, {
                        source: ytdlp.stdout,
                        filename: filename
                    }, {
                        caption: `🚀 Downloaded in ${BOT_USERNAME} \n\nUse it and share with friends! 🥰`,
                        ...Markup.inlineKeyboard([
                            [
                                {
                                    text: "Share ⬆️",
                                    switch_inline_query: `Check out this downloader!`
                                }
                            ]
                        ])
                    });
                }

                // Clear timeout only after successful send
                if (downloadTimeout) clearTimeout(downloadTimeout);

                await increaseDownloadCount(redis, userId);
                await telegram.deleteMessage(chatId, messageId);
            } catch (tgErr) {
                throw tgErr;
            } finally {
                if (ytdlp && !ytdlp.killed) {
                    ytdlp.kill("SIGKILL");
                }
                if (downloadTimeout) clearTimeout(downloadTimeout);
            }

        } catch (err) {
            console.error("Job execution crashed:", err.message);
            try {
                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    `❌ *Download Failed*

We couldn't process this video link. This usually happens if:
• The video is private, age-restricted, or deleted.
• The link format is incorrect or broken.
• The platform is experiencing temporary downtime.

💡 *What to do:* Please double-check that the video is public and try copying the link again. If it keeps failing, try a different link or try again in a few minutes!`,
                    { parse_mode: "Markdown" }
                );
            } catch (tgEx) {
                console.error("Failed to send error message to Telegram:", tgEx.message);
            }

            throw err; // marks job as failed
        } finally {
            if (ytdlp && !ytdlp.killed) {
                ytdlp.kill("SIGKILL");
            }
            if (downloadTimeout) clearTimeout(downloadTimeout);
        }
    },
    {
        connection,
        concurrency: 2,
        settings: {
            maxRetriesPerJob: 2,
            retryProcessDelay: 5000,
        }
    }
);

worker.on("completed", job => {
    console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
});

const shutdown = async (signal) => {
    console.log(`🛑 Received ${signal}. Shutting down worker...`);
    await worker.close();
    process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("✔ Video worker running");