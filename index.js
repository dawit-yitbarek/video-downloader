import express from 'express';
import fs from "fs";
import { NODE_ENV, PORT, YTDLP_COOKIES } from './src/config/env.js';
import { COOKIE_PATH } from './src/config/constants.js';
import { validateEnvironment } from './src/config/validateEnv.js';
import { handleTelegramUpdate, bot } from "./src/utils/telegram.js";
import { redis, testRedisConnection } from "./src/utils/redis.js";
import { initBotHandlers } from './src/bot/botHandlers.js';
import './consumer.js';
import logger from './src/utils/logger.js';

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("OK"));
// app.post('/telegram', handleTelegramUpdate);

(async () => {
    try {
        // Validate environment variables
        validateEnvironment();

        // Test Redis connection
        await testRedisConnection();

        if (!fs.existsSync(COOKIE_PATH)) {
            fs.writeFileSync(COOKIE_PATH, YTDLP_COOKIES);
        }

        // Register bot handlers
        initBotHandlers()

        bot.telegram.getMe()
            .then((botInfo) => {
                logger.info(`✔ Bot @${botInfo.username} connected successfully (polling)`);
                // Launch without awaiting so it doesn't block the loop
                return bot.launch();
            })
            .catch((err) => logger.error(`❌ Failed to launch bot (Telegram server offline): ${err.message}`));


        const server = app.listen(PORT, "0.0.0.0", () => {
            logger.info(`✔ Server running on port ${PORT}`);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            logger.info(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

            // Stop accepting new requests
            server.close(async () => {
                logger.info("✔ HTTP server closed");

                // Stop bot
                await bot.stop(`Graceful shutdown on ${signal}`);
                logger.info("✔ Bot stopped");

                // Close Redis connection
                await redis.quit();
                logger.info("✔ Redis connection closed");

                process.exit(0);
            });

            // Force shutdown after 30 seconds
            setTimeout(() => {
                logger.error("❌ Graceful shutdown timeout exceeded, forcing exit");
                process.exit(1);
            }, 30000);
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    } catch (err) {
        logger.error(`❌ Startup error: ${err.message}`);
        process.exit(1);
    }
})();