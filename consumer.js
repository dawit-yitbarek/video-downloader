import { Worker } from "bullmq";
import { spawn } from "child_process";
import { Markup } from "telegraf";
import { BOT_USERNAME } from "./src/config/env.js";
import { COOKIE_PATH } from "./src/config/constants.js";
import { checkDownloadLimit, increaseDownloadCount } from "./src/helpers/rateLimit.js";
import { telegram } from "./src/utils/telegram.js";
import { QUEUE_NAME, queueConnection } from "./src/helpers/videoQueue.js";
import logger from "./src/utils/logger.js";
import { cacheVideoData } from "./src/helpers/sendFromCache.js";

async function processDownloadJob(job) {
    const { chatId, userId, messageId, videoUrl, format, ext, title, isAudio, label } = job.data;
    let ytdlp = null;
    let downloadTimeout = null;

    try {
        // Quota Enforcement
        const downloadLimit = await checkDownloadLimit(userId);
        if (!downloadLimit.allowed) {
            const hoursLeft = Math.floor(downloadLimit.resetIn / 3600);
            const minutesLeft = Math.ceil((downloadLimit.resetIn % 3600) / 60);
            const timeLeftStr = hoursLeft > 0 ? `*${hoursLeft}h ${minutesLeft}m*` : `*${minutesLeft} minutes*`;

            await telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                `❌ * Daily Download Limit Reached *\n\n` +
                `You have used all your video downloads for this 24 - hour window.\n\n` +
                `⏳ Your quota will unlock in ${timeLeftStr}.`,
                { parse_mode: "Markdown" }
            );
            return;
        }

        // Status Update
        await telegram.editMessageText(
            chatId,
            messageId,
            undefined,
            `🚀 Downloading & sending ${isAudio ? 'Audio' : 'Video'}...`
        );

        // Spawning yt-dlp binary stream
        const ytdlpArgs = [
            "-f", format,
            "--cookies", COOKIE_PATH,
            "--js-runtimes", "node",
            "--remote-components", "ejs:github",
            "-o", "-",
            videoUrl
        ];

        if (format.includes("+")) {
            ytdlpArgs.push("--merge-output-format", ext);
        }

        ytdlp = spawn("yt-dlp", ytdlpArgs);
        ytdlp.stderr.on("data", (data) => {
            const output = data.toString().trim();
            if (!output) return;

            // Split multi-line outputs if yt-dlp sends multiple lines at once
            const lines = output.split('\n');

            lines.forEach(line => {
                const cleanLine = line.trim();
                if (cleanLine.startsWith("ERROR:")) {
                    logger.error(`[yt-dlp] ${cleanLine.replace(/^ERROR:\s*/, "")}`);
                } else if (cleanLine.startsWith("WARNING:")) {
                    logger.warn(`[yt-dlp] ${cleanLine.replace(/^WARNING:\s*/, "")}`);
                }
            });
        });

        // Payload dispatching via Telegram streams
        const filename = `file_${Date.now()}.${ext}`;

        await new Promise((resolve, reject) => {
            let isSettled = false;

            // Process timeout protection (5 minutes)
            downloadTimeout = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    reject(new Error("DOWNLOAD_TIMEOUT"));
                }
            }, 300000); // 5 minutes

            let uploadPromise;
            if (isAudio) {
                uploadPromise = telegram.sendAudio(chatId, { source: ytdlp.stdout, filename }, {
                    caption: `${BOT_USERNAME}`,
                    title: title,
                });
            } else {
                uploadPromise = telegram.sendVideo(chatId, { source: ytdlp.stdout, filename }, {
                    caption: `🚀 Downloaded in ${BOT_USERNAME} \n\nUse it and share with friends! 🥰`,
                    ...Markup.inlineKeyboard([[
                        { text: "Share ⬆️", switch_inline_query: `Check out this downloader!` }
                    ]])
                });
            }

            // Resolve or Reject the wrapper promise based on upload success
            uploadPromise.then((res) => {
                if (!isSettled) {
                    isSettled = true;
                    const fileId = res.video?.file_id || res.audio?.file_id || res.document?.file_id;
                    if (fileId) {
                        cacheVideoData(fileId, label, videoUrl, title).catch(() => { });
                    } else {
                        logger.warn("⚠️ Failed to parse valid file_id from Telegram response object wrapper.");
                    }
                    resolve(res);
                }
            }).catch((err) => {
                if (!isSettled) {
                    isSettled = true;
                    reject(err);
                }
            });
        })

        // Cleanup and accounting on success
        if (downloadTimeout) clearTimeout(downloadTimeout);
        await increaseDownloadCount(userId);
        await telegram.deleteMessage(chatId, messageId);

    } catch (err) {
        logger.error(`❌ [Worker] Job execution crashed/timed out: ${err.message}`);
        try {
            const userErrorMessage = err.message === "DOWNLOAD_TIMEOUT"
                ? `❌ *Download Timed Out*\n\nThe video file is either too large or the platform is responding too slowly. Please try again with a shorter video.`
                : `❌ *Download Failed*\n\n` +
                `We couldn't process this video link. This usually happens if:\n` +
                `• The video is private, age-restricted, or deleted.\n` +
                `• The link format is incorrect or broken.\n` +
                `• The platform is experiencing temporary downtime.\n\n` +
                `*What to do:* Please double-check that the video is public and try copying the link again. If it keeps failing, try a different link or try again in a few minutes!`
            await telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                userErrorMessage,
                { parse_mode: "Markdown" }
            );
        } catch (tgEx) {
            logger.error(`⚠️ [Worker] Failed to report crash to user: ${tgEx.message}`);
        }
        throw err; // Forward to BullMQ retry logic
    } finally {
        if (downloadTimeout) clearTimeout(downloadTimeout);
        if (ytdlp && !ytdlp.killed) ytdlp.kill("SIGKILL");
    }
}

// Instantiate Worker
const worker = new Worker(QUEUE_NAME, processDownloadJob, {
    connection: queueConnection,
    concurrency: 10,
});

worker.on("completed", job => logger.info(`✅ [Worker] Job ${job.id} completed`));
worker.on("failed", (job, err) => logger.error(`❌ [Worker] Job ${job?.id} failed: ${err.message}`));

// Worker termination logic
const shutdownWorker = async (signal) => {
    logger.info(`🛑 Received ${signal}. Closing background worker...`);
    await worker.close();
    process.exit(0);
};

process.on("SIGTERM", () => shutdownWorker("SIGTERM"));
process.on("SIGINT", () => shutdownWorker("SIGINT"));

logger.info("✔ Background Video Worker Running");