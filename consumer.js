import { Worker } from "bullmq";
import { spawn, exec } from "child_process";
import { Markup } from "telegraf";
import { BOT_USERNAME } from "./src/config/env.js";
import { COOKIE_PATH } from "./src/config/constants.js";
import { checkDownloadLimit, increaseDownloadCount } from "./src/helpers/rateLimit.js";
import { telegram } from "./src/utils/telegram.js";
import { QUEUE_NAME, queueConnection } from "./src/helpers/videoQueue.js";
import logger from "./src/utils/logger.js";
import { cacheVideoData } from "./src/helpers/sendFromCache.js";
import fs from "fs";
import path from "path";
import os from "os";

// Helper function to pull the pre-existing metadata thumbnail to disk
async function downloadAndOptimizeThumbnail(url, outputPath) {
    try {
        if (!url) return false;

        const tempRawPath = path.join(os.tmpdir(), `raw_thumb_${Date.now()}`);

        // Download the raw web image file
        const response = await fetch(url);
        if (!response.ok) return false;

        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tempRawPath, Buffer.from(arrayBuffer));

        // Use ffmpeg to perfectly comply with all Telegram rules:
        const cmd = `ffmpeg -i "${tempRawPath}" -vf "scale=320:-1" -q:v 5 "${outputPath}" -y`;

        return new Promise((resolve) => {
            exec(cmd, (error) => {
                // Clean up the raw temporary download file immediately
                if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);

                if (error) {
                    logger.error(`⚠️ Thumbnail compliance processing failed: ${error.message}`);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    } catch (err) {
        logger.error(`Error in downloadAndOptimizeThumbnail: ${err.message}`);
        return false;
    }
}


async function processDownloadJob(job) {
    const { chatId, userId, messageId, videoUrl, format, ext, title, isAudio, label } = job.data;
    let ytdlp = null;
    let downloadTimeout = null;
    // Create a unique local file trajectory on storage disk
    const tempDir = os.tmpdir();
    const tempFilename = `download_${Date.now()}.${ext}`;
    const localFilePath = path.join(tempDir, tempFilename);

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
            "--print-json",
            "-f", format,
            "--cookies", COOKIE_PATH,
            "--js-runtimes", "node",
            "--remote-components", "ejs:github",
            "--postprocessor-args", "ffmpeg:-movflags +faststart",
        ];

        if (format.includes("+")) {
            // If the format is a combination of video and audio, we need to ensure that yt-dlp merges them correctly.
            ytdlpArgs.push("--merge-output-format", ext);
        }

        // Keep output destinations at the absolute end of the execution array
        ytdlpArgs.push("-o", localFilePath, videoUrl);


        // Payload dispatching via Telegram streams
        const filename = `file_${Date.now()}.${ext}`;
        let stdoutData = ""; // variable to collect the JSON string
        let parsedMetadata = {}

        // Spawn the download and only wait for the file to be on disk
        await new Promise((resolve, reject) => {
            let isSettled = false;

            // Process timeout protection (5 minutes only for downloading)
            downloadTimeout = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    if (ytdlp && !ytdlp.killed) ytdlp.kill("SIGKILL");
                    reject(new Error("DOWNLOAD_TIMEOUT"));
                }
            }, 300000);

            ytdlp = spawn("yt-dlp", ytdlpArgs);

            // Dynamically parse the metadata on-the-fly and discard the remaining progress spam
            ytdlp.stdout.on("data", (data) => {
                if (!parsedMetadata.id) {
                    stdoutData += data.toString();
                    if (stdoutData.includes('\n')) {
                        try {
                            const firstLine = stdoutData.split('\n')[0].trim();
                            parsedMetadata = JSON.parse(firstLine);
                            stdoutData = ""; // Clear buffer immediately to free memory
                        } catch (e) {
                            // Keep accumulating if the chunk split right in the middle of the JSON string
                        }
                    }
                }
            });

            ytdlp.stderr.on("data", (data) => {
                const output = data.toString().trim();
                if (!output) return;
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

            ytdlp.on("close", (code) => {
                if (isSettled) return;
                isSettled = true;
                if (downloadTimeout) clearTimeout(downloadTimeout);

                if (code !== 0) {
                    return reject(new Error(`yt-dlp exited with code ${code}`));
                }


                if (!parsedMetadata.id && stdoutData.trim()) {
                    try {
                        const firstLine = stdoutData.split('\n')[0].trim();
                        parsedMetadata = JSON.parse(firstLine);
                    } catch (parseErr) {
                        logger.warn(`⚠️ Could not parse on-the-fly metadata JSON on exit: ${parseErr.message}`);
                    }
                }

                resolve(null);
            });

            ytdlp.on("error", (spawnErr) => {
                if (!isSettled) {
                    isSettled = true;
                    if (downloadTimeout) clearTimeout(downloadTimeout);
                    reject(spawnErr);
                }
            });
        });

        // Extract the numerical layout values safely from your parsed metadata object
        const videoDuration = parseInt(parsedMetadata.duration) || 0;
        const remoteThumbUrl = parsedMetadata.thumbnail || (parsedMetadata.thumbnails?.length ? parsedMetadata.thumbnails[parsedMetadata.thumbnails.length - 1].url : "")
        const thumbFilename = `thumb_${Date.now()}.jpg`;
        const localThumbPath = path.join(os.tmpdir(), thumbFilename);
        const hasThumbnail = await downloadAndOptimizeThumbnail(remoteThumbUrl, localThumbPath);


        let uploadPromise;
        if (isAudio) {
            uploadPromise = telegram.sendAudio(chatId, { source: localFilePath, filename }, {
                caption: `${BOT_USERNAME}`,
                duration: videoDuration,
                title: title,
            });
        } else {
            const videoOptions = {
                caption: `🚀 Downloaded in ${BOT_USERNAME} \n\nUse it and share with friends! 🥰`,
                supports_streaming: true,
                duration: videoDuration,
                ...Markup.inlineKeyboard([[
                    { text: "Share ⬆️", switch_inline_query: `Check out this downloader!` }
                ]])
            };

            if (hasThumbnail && fs.existsSync(localThumbPath)) {
                videoOptions.thumbnail = { source: localThumbPath, filename: thumbFilename };
            }

            uploadPromise = telegram.sendVideo(chatId, { source: localFilePath, filename },
                videoOptions
            );
        }

        const res = await uploadPromise;

        if (fs.existsSync(localThumbPath)) {
            try { fs.unlinkSync(localThumbPath); } catch (_) { }
        }

        // Cache the file metadata after successful upload
        const fileId = res.video?.file_id || res.audio?.file_id || res.document?.file_id;
        const { id: videoId, extractor } = parsedMetadata;
        if (fileId && videoId && extractor) {
            cacheVideoData(fileId, label, videoId, title, extractor, videoUrl).catch(() => { });
        } else {
            logger.warn("⚠️ Failed to parse valid file_id from Telegram response, or videoId/extractor was missing.");
        }

        // Cleanup and accounting on success
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
        if (fs.existsSync(localFilePath)) {
            try {
                fs.unlinkSync(localFilePath)
            } catch (error) {
                logger.error(`⚠️ Failed to delete temporary file ${localFilePath}: ${error.message}`);
            }
        }
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