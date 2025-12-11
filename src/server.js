import express from "express";
import bot from "./controllers/bot.js";
import { PORT, NODE_ENV, BACKEND_URL } from "./config/env.js";
import { refreshCookies } from "./utils/cookieRefresher.js";
import { paths } from "./jobs/cron.js";
const { ytCookiePath, igCookiePath, ytProfileDir, igProfileDir } = paths;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("OK"));

(async () => {
    try {
        // Refresh cookies once at startup
        await refreshCookies(ytProfileDir, "https://youtube.com", ytCookiePath);
        await refreshCookies(igProfileDir, "https://instagram.com", igCookiePath);
    } catch (error) {
        console.error("❌ Failed to refresh cookies at startup:", error);
    }

    if (NODE_ENV === "production") {
        const path = `/telegram`;
        bot.telegram.setWebhook(`${BACKEND_URL}${path}`);
        bot.startWebhook(path, app);
        console.log(`✔ Bot webhook set at ${BACKEND_URL}${path}`);
    } else {
        await bot.launch();
        console.log("✔ Bot launched (polling)");
    }


    app.listen(PORT, "0.0.0.0", () => {
        console.log(`✔ Server running on port ${PORT}`);
    });
})();