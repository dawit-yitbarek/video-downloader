import { Worker } from "bullmq";
import fs, { createWriteStream } from "fs";
import { PassThrough } from "stream";
import { unlink } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { YTDLP_COOKIES, REDIS_URL } from "./src/config/env.js";
import { uploadVideoToB2 } from "./src/helpers/uploadToB2.js";
import { redis } from "./src/utils/redis.js";
import { checkDownloadLimit, increaseDownloadCount } from "./src/helpers/rateLimit.js";
import { telegram } from "./src/utils/telegram.js";

const COOKIE_PATH = path.resolve("./bin/cookies.txt");

const isPinterest = (url) => {
    return url.includes("pinterest.com") || url.includes("pin.it");
};

const connection = { url: REDIS_URL };

const worker = new Worker(
    "videoQueue",
    async job => {
        const { chatId, messageId, videoUrl, userId } = job.data;
        let ytdlp = null;
        const tempFilePath = path.resolve(`./bin/temp_${job.id}.mp4`);
        let fileWriteStream = createWriteStream(tempFilePath);

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

            await telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                "🚀 Downloading & sending video..."
            );

            const downloadPromise = new Promise((resolve, reject) => {
                const format = isPinterest(videoUrl) ? "bv*+ba/b" : "best[ext=mp4]/best";
                ytdlp = spawn("yt-dlp", [
                    "-f", format,
                    "--cookies", COOKIE_PATH,
                    "--js-runtimes", "node",
                    "--remote-components", "ejs:github",
                    "-o", "-",
                    videoUrl
                ]);

                ytdlp.stderr.pipe(process.stderr);
                ytdlp.stdout.pipe(fileWriteStream);

                const telegramStream = new PassThrough();
                ytdlp.stdout.pipe(telegramStream);

                ytdlp.on("close", (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`yt-dlp exited with code ${code}`));
                });

                ytdlp.on("error", (err) => reject(err));

                // Send the stream to Telegram concurrently
                telegram.sendVideo(chatId, {
                    source: telegramStream,
                    filename: "video.mp4"
                }, {
                    caption: "🎬 Here's your video!"
                })
                    .then(() => {
                        resolve("TELEGRAM_SUCCESS");
                    })
                    .catch((tgErr) => {
                        const errMsg = tgErr.message?.toLowerCase() || "";
                        if (errMsg.includes("too large") || errMsg.includes("413") || errMsg.includes("too big") || errMsg.includes("hang up")) {
                            // Telegram rejected it due to size/timeout, trigger fallback.
                            ytdlp.stdout.unpipe(telegramStream);
                            telegramStream.destroy();
                            resolve("TELEGRAM_FALLBACK");
                        } else {
                            reject(tgErr);
                        }
                    });
            });

            // Set up execution timeout logic (5 minutes)
            const downloadTimeout = setTimeout(() => {
                if (ytdlp && !ytdlp.killed) ytdlp.kill("SIGKILL");
            }, 300000);

            const result = await downloadPromise;
            clearTimeout(downloadTimeout);

            // Telegram upload success
            if (result === "TELEGRAM_SUCCESS") {
                await increaseDownloadCount(redis, userId);
                await telegram.deleteMessage(chatId, messageId);

                // Safely close write streams and remove temp file
                fileWriteStream.destroy();
                await unlink(tempFilePath).catch(() => { });
            }

            // Telegram upload fail, Fallback to B2 cloud
            else if (result === "TELEGRAM_FALLBACK") {
                console.warn("Telegram failed or file too large. Falling back to Cloud Storage...");

                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    "📦 Video too large for Telegram\nUploading to cloud…"
                );

                // Wait for yt-dlp to finish downloading completely to disk if it hasn't already
                await new Promise((resolve) => {
                    if (ytdlp.killed || ytdlp.exitCode !== null) {
                        resolve();
                    } else {
                        ytdlp.on("close", () => resolve());
                    }
                });

                // Close and finalize the file write stream so the file is complete on disk
                await new Promise((resolve) => {
                    fileWriteStream.end(() => resolve());
                });

                // Stream the completed file from disk directly to B2
                const cloudPath = await uploadVideoToB2(tempFilePath);

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
                await increaseDownloadCount(redis, userId);

                // Clean up the disk file after successful cloud upload
                await unlink(tempFilePath).catch(() => { });
            }

        } catch (err) {
            console.error("Job execution crashed:", err.message);
            fileWriteStream.destroy();
            await unlink(tempFilePath).catch(() => { });

            try {
                await telegram.editMessageText(
                    chatId,
                    messageId,
                    undefined,
                    "❌ Failed to process video."
                );
            } catch (tgEx) {
                console.error("Failed to send error message to Telegram:", tgEx.message);
            }
            throw err;
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