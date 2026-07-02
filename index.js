import express from 'express';
import fs from "fs";
import { NODE_ENV, BACKEND_URL, PORT, YTDLP_COOKIES } from './src/config/env.js';
import { COOKIE_PATH } from './src/config/constants.js';
import { validateEnvironment } from './src/config/validateEnv.js';
import { handleTelegramUpdate, bot } from "./src/utils/telegram.js";
import { redis, testRedisConnection } from "./src/utils/redis.js";
import './producer.js';
import './consumer.js';

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("OK"));
app.post('/telegram', handleTelegramUpdate);

(async () => {
    try {
        // Validate environment variables
        validateEnvironment();

        // Test Redis connection
        await testRedisConnection();

        if (!fs.existsSync(COOKIE_PATH)) {
            fs.writeFileSync(COOKIE_PATH, YTDLP_COOKIES);
        }

        if (NODE_ENV === "production") {
            await bot.telegram.setWebhook(`${BACKEND_URL}/telegram`);
            console.log(`✅ Webhook set at ${BACKEND_URL}/telegram`);
        } else {
            bot.launch()
                .then(() => console.log("✔ Bot launched (polling)"))
                .catch((err) => console.error("❌ Failed to launch bot (Telegram server offline):", err.message));
        }

        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`✔ Server running on port ${PORT}`);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

            // Stop accepting new requests
            server.close(async () => {
                console.log("✔ HTTP server closed");

                // Stop bot
                await bot.stop(`Graceful shutdown on ${signal}`);
                console.log("✔ Bot stopped");

                // Close Redis connection
                await redis.quit();
                console.log("✔ Redis connection closed");

                process.exit(0);
            });

            // Force shutdown after 30 seconds
            setTimeout(() => {
                console.error("❌ Graceful shutdown timeout exceeded, forcing exit");
                process.exit(1);
            }, 30000);
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    } catch (err) {
        console.error('❌ Startup error:', err.message);
        process.exit(1);
    }
})();