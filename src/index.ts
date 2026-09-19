import { initBot, bot } from './bot/index.js';
import { getRedisClient } from './services/redis.service.js';
import { userBotClient } from './services/userBot/messageListener.js';
import { setupUserBotListeners } from './services/userBot/messageListener.js';
import fs from 'fs';
import { COOKIE_PATH } from './config/constants.js';
import { env } from './config/env.js';
import { initDownloadWorker } from './services/worker.service.js';
import { notifyAdminError } from './utils/logger.js';

async function main() {
    // 1. Initialize Bot Instance
    const worker = initDownloadWorker()
    if (!fs.existsSync(COOKIE_PATH) && env.YTDLP_COOKIES) {
        fs.writeFileSync(COOKIE_PATH, env.YTDLP_COOKIES);
    }

    if (env.INCLUDE_USERBOT) {
        if (!userBotClient.connected) {
            console.log("🔌 userBot disconnected. Connecting...");
            await userBotClient.connect();
            // 1. Fetch recent chats to populate GramJS local session cache with access hashes
            await userBotClient.getDialogs({ limit: 50 });

            // 2. Now getEntity will safely find -1005521692680 in cache
            await userBotClient.getEntity(env.PRIVATE_GROUP_ID!);
        }
        await setupUserBotListeners()
    }


    // 2. Define Graceful Shutdown Handler
    let isShuttingDown = false;

    const handleShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`⚠️ Received ${signal}. Starting graceful shutdown...`);

        try {
            // Stop receiving new Telegram updates
            if (bot.isInited()) {
                console.log('📦 Stopping Telegram bot instance...');
                await bot.stop();
            }

            console.log('⏳ closing worker...');
            await worker.close();

            // Close Redis connections
            console.log('🔌 Disconnecting Redis client...');
            await getRedisClient().quit();

            console.log('✅ Graceful shutdown completed. Exiting.');
            process.exit(0);
        } catch (error: any) {
            console.error(`❌ Error during shutdown: ${error.message || error}`);
            process.exit(1);
        }
    };

    // Register signal listeners
    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));

    // Guard against unhandled process-level exceptions
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
        notifyAdminError(error, 'Uncaught Exception');
    });

    process.on('unhandledRejection', (reason) => {
        console.error('💥 Unhandled Promise Rejection:', reason);
        notifyAdminError(reason, 'Unhandled Promise Rejection');
    });

    // 3. Start Long Polling
    await initBot();
}

main().catch((error) => {
    console.error('💥 Fatal error during startup:', error);
    process.exit(1);
});