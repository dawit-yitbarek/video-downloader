import { Queue, Worker, Job } from 'bullmq';
import { env } from '../config/env.js';
import { checkRateLimit, increaseRateLimit, setMediaCache } from '../services/redis.service.js';
import { ytdlpDownloadMedia } from './yt-dlp/mediaDownloader.js';
import { galleryDlDownloadMedia } from './gallery-dl/mediaDownloader.js';
import type { downloadingTools } from '../types/index.js';
import fs from 'fs/promises';
import { sendSingleMedia, sendMediaErrorMessage, sendRateLimitedMessage, sendGroupMedia } from '../bot/helpers/messageSender.js';
import type { PlatformType, label } from '../types/index.js';
import { bot } from '../bot/index.js';
import path from 'path';
import { notifyAdminError } from '../utils/logger.js';


export interface DownloadJobData {
    chatId: number;
    messageId: number;
    mediaId: string | null;
    url: string;
    platform: PlatformType;
    label: label;
    downloadingTool: downloadingTools;
}

const REDIS_CONNECTION = {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
};

// 1. Initialize Queue
export const downloadQueue = new Queue<DownloadJobData>('video-downloads', {
    connection: REDIS_CONNECTION,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
    }
});

// 2. Initialize Worker with STRICT Concurrency Limit
const downloadWorker = new Worker<DownloadJobData>(
    'video-downloads',
    async (job: Job<DownloadJobData>) => {
        const { chatId, messageId, url, platform, mediaId, label, downloadingTool } = job.data;

        // Create a dedicated directory for this job execution
        const jobDir = path.join(env.DOWNLOAD_PATH, `job_${Date.now()}_${mediaId || 'media'}`);

        try {
            const userData = await checkRateLimit(chatId!);
            if (!userData.allowed) {
                return await sendRateLimitedMessage({ chatId, messageId, userData });
            }

            // Ensure the job temporary folder exists
            await fs.mkdir(jobDir, { recursive: true });

            // Update status message text
            const itemToSend = downloadingTool === 'gallery-dl' ? 'post' : (label === 'audio' ? 'Audio' : 'Video');
            const statusText = `🚀 *Downloading & sending ${itemToSend}...*`;

            await bot.api.editMessageText(chatId, messageId, statusText, { parse_mode: 'Markdown' })
                .catch((error: any) => {
                    console.error(`[worker] Failed to edit status message: ${error.message || error}`);
                });

            // Branch execution based on downloadingTool
            if (downloadingTool === 'gallery-dl') {
                const { files } = await galleryDlDownloadMedia({ url, outputDir: jobDir });

                // Send media album/photos/videos via sendMediaGroup
                const cachedItems = await sendGroupMedia({
                    chatId,
                    messageId,
                    items: files
                });

                // Cache mediaGroup file_ids
                if (mediaId && cachedItems.length > 0) {
                    await setMediaCache({ platform, mediaId, mediaGroup: cachedItems });
                }
            } else if (downloadingTool === 'yt-dlp') {
                const { filePath, thumbnailPath, duration } = await ytdlpDownloadMedia({ url, label, outputDir: jobDir });

                // Send single media
                const fileId = await sendSingleMedia({
                    chatId,
                    messageId,
                    source: filePath,
                    label,
                    duration,
                    thumbnailPath
                });

                // Cache single file_id by resolution label
                if (fileId && mediaId) {
                    await setMediaCache({ platform, label, fileId, mediaId });
                }
            }

            await increaseRateLimit(chatId);

        } catch (error: any) {
            const errorMessage = error.message || error;
            await sendMediaErrorMessage({ chatId, messageId, label, errorMessage, downloadingTool });
            throw new Error(errorMessage);
        } finally {
            await fs.rm(jobDir, { recursive: true, force: true }).catch((err) => {
                console.error(`[Worker] Failed to cleanup job folder (${jobDir}): ${err.message || err}`);
                notifyAdminError(err, 'Job Folder Cleanup');
            });
        }
    },
    {
        connection: REDIS_CONNECTION,
        concurrency: 5,
    }
);

export function initDownloadWorker() {
    console.log('⚙️ Download Worker initialized and listening for jobs...');

    downloadWorker.on('completed', (job) => {
        console.log(`✅ [Worker] Job ${job.id} completed successfully. Url: ${job?.data?.url}`);
    });

    downloadWorker.on('failed', (job, error) => {
        console.error(`[Worker] Job ${job?.id} failed: ${error.message || error}`);
        notifyAdminError(error, 'Worker failed');
    });

    return downloadWorker;
}