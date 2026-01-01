import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { YTDLP_COOKIES, REDIS_URL } from "./src/config/env.js";
import { getVideoMeta } from "./src/helpers/getVideoMeta.js";
import { uploadVideoToB2 } from "./src/helpers/uploadToB2.js";
import { redis } from "./src/utils/redis.js";
import { checkDownloadLimit, increaseDownloadCount } from "./src/helpers/rateLimit.js";
import { telegram } from "./src/utils/telegram.js";

const COOKIE_PATH = path.resolve("./bin/cookies.txt");
if (!fs.existsSync(COOKIE_PATH)) {
    fs.writeFileSync(COOKIE_PATH, YTDLP_COOKIES);
}

const isPinterest = (url) => {
    return url.includes("pinterest.com") || url.includes("pin.it");
};

//  redis connection
const connection = { url: REDIS_URL };

// worker
const worker = new Worker(
    "videoQueue",
    async job => {
        const { chatId, messageId, videoUrl, userId } = job.data;
        let ytdlp = null;
        try {
            const downloadLimit = await checkDownloadLimit(redis, userId);
            if (!downloadLimit.allowed) {
                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    `❌ Daily download limit reached.\nTry again in ${Math.ceil(downloadLimit.resetIn / 3600)}h`
                );
                return;
            }

            // await telegram.editMessageText(
            //     chatId,
            //     messageId,
            //     undefined,
            //     "🔍 Checking video size..."
            // );

            // const videoSize = await getVideoMeta(videoUrl, COOKIE_PATH);

            // let sizeMB = null;
            // if (videoSize) {
            //     sizeMB = videoSize / (1024 * 1024);
            // }


            // BIG VIDEO → CLOUD
            // if (sizeMB && sizeMB > 50) {
            //     await telegram.editMessageText(
            //         chatId,
            //         messageId,
            //         undefined,
            //         `📦 Video is ${sizeMB.toFixed(1)} MB\nUploading to cloud…`
            //     );

            //     const cloudPath = await uploadVideoToB2(videoUrl, COOKIE_PATH);

            //     await telegram.editMessageText(
            //         chatId,
            //         messageId,
            //         undefined,
            //         "📦 *Video is too large to send to Telegram*\n\n" +
            //         "⬇️ Tap the button below to download the video.\n",
            //         {
            //             parse_mode: "Markdown",
            //             reply_markup: {
            //                 inline_keyboard: [
            //                     [
            //                         {
            //                             text: "⬇️ Download video",
            //                             url: cloudPath
            //                         }
            //                     ]
            //                 ]
            //             }
            //         }
            //     );
            //     await increaseDownloadCount(redis, userId)
            //     return;
            // }


            // SMALL VIDEO → DIRECT STREAM
            await telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                "🚀 Downloading & sending video..."
            );

            try {
                const format = isPinterest(videoUrl) ? "bv*+ba/b" : "best[ext=mp4]/best";
                ytdlp = spawn("yt-dlp", [
                    "-f", format,
                    "--cookies", COOKIE_PATH,
                    "-o", "-",
                    videoUrl
                ]);

                ytdlp.stderr.pipe(process.stderr);

                // Timeout for download (5 minutes)
                const downloadTimeout = setTimeout(() => {
                    if (ytdlp) ytdlp.kill("SIGKILL");
                }, 300000);

                await telegram.sendVideo(chatId, {
                    source: ytdlp.stdout,
                    filename: "video.mp4"
                }, {
                    caption: "🎬 Here's your video!"
                });
                clearTimeout(downloadTimeout);
                await increaseDownloadCount(redis, userId)
                await telegram.deleteMessage(chatId, messageId);

            } catch (tgErr) {
                // Telegram rejected the file
                console.warn("Telegram upload failed, falling back to cloud:", tgErr.message);
                try {
                    if (ytdlp) ytdlp.kill("SIGKILL");
                } catch (killErr) {
                    console.warn("Error killing yt-dlp process:", killErr.message);
                }

                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    "📦 Video too large for Telegram\nUploading to cloud…"
                );

                const cloudPath = await uploadVideoToB2(videoUrl, COOKIE_PATH);

                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    "📦 *Video is too large to send to Telegram*\n\n" +
                    "⬇️ Tap the button below to download the video.\n",
                    {
                        parse_mode: "Markdown",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "⬇️ Download video",
                                        url: cloudPath
                                    }
                                ]
                            ]
                        }
                    }
                );
                await increaseDownloadCount(redis, userId)
            } finally {
                if (ytdlp && !ytdlp.killed) {
                    ytdlp.kill("SIGKILL");
                }
            }

        } catch (err) {
            console.error("Job failed:", err.message);
            try {
                if (ytdlp) ytdlp.kill("SIGKILL");
            } catch (killErr) {
                console.warn("Error killing yt-dlp process:", killErr.message);
            }

            await telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                "❌ Failed to process video."
            );

            throw err; // marks job as failed
        } finally {
            if (ytdlp && !ytdlp.killed) {
                ytdlp.kill("SIGKILL");
            }
        }
    },
    {
        connection,
        concurrency: 2,
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