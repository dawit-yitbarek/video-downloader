import { Queue } from 'bullmq';
import { REDIS_URL } from '../config/env.js';
import logger from '../utils/logger.js';

export const QUEUE_NAME = 'videoQueue';

export const queueConnection = { url: REDIS_URL };

export const videoQueue = new Queue(QUEUE_NAME, {
    connection: queueConnection
});

// Adds a video download job to the background processing queue.
export async function addVideoJob(chatId, userId, messageId, videoUrl, format, ext, title, isAudio, label) {
    await videoQueue.add('processVideo', {
        chatId,
        userId,
        messageId,
        videoUrl,
        format,
        ext,
        title,
        isAudio,
        label
    },
        {
            attempts: 1
        });
    logger.info(`[Queue] Job added: ${videoUrl}`);
}