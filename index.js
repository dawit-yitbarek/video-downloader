import express from 'express';
import { bot, handleTelegramUpdate } from './src/utils/telegram.js';
import { NODE_ENV, BACKEND_URL, PORT } from './src/config/env.js';
import downloadRoute from './src/routes/download.js';
import './producer.js';
import './consumer.js';

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("OK"));
app.post('/telegram', handleTelegramUpdate);
app.use('/', downloadRoute);

(async () => {

    if (NODE_ENV === "production") {
        await bot.telegram.setWebhook(`${BACKEND_URL}/telegram`);
        console.log(`✅ Webhook set at ${BACKEND_URL}/telegram`);
    } else {
        bot.launch();
        console.log("✔ Bot launched (polling)");
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`✔ Server running on port ${PORT}`);
    });
})();


// Graceful stop for the server environment
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

process.on('uncaughtException', (err) => {
    console.error(`💥 Uncaught Exception: ${err}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`⚠️ Unhandled Rejection at: ${promise}. reason: ${reason}`);
});