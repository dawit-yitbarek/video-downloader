import express from "express";
import bot, { handleTelegramUpdate } from "./controllers/bot.js";
import { PORT, NODE_ENV, BACKEND_URL } from "./config/env.js";
import { refreshCookies } from "./utils/cookieRefresher.js";
import { paths } from "./jobs/cron.js";
const { ytCookiePath, igCookiePath, ytProfileDir, igProfileDir } = paths;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("OK"));
app.post('/telegram', handleTelegramUpdate);

(async () => {
    try {
        // Refresh cookies once at startup
        await refreshCookies(ytProfileDir, "https://youtube.com", ytCookiePath);
        await refreshCookies(igProfileDir, "https://instagram.com", igCookiePath);
    } catch (error) {
        console.error("❌ Failed to refresh cookies at startup:", error);
    }

    if (NODE_ENV === "production") {
        await bot.telegram.setWebhook(`${BACKEND_URL}/telegram`);
        console.log(`✅ Webhook set at ${BACKEND_URL}/telegram`);
    } else {
        await bot.launch();
        console.log("✔ Bot launched (polling)");
    }


    app.listen(PORT, "0.0.0.0", () => {
        console.log(`✔ Server running on port ${PORT}`);
    });
})();