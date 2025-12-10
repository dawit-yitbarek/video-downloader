import express from "express";
import bot from "./controllers/bot.js";
import { PORT } from "./config/env.js";
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

    try {
        await bot.launch();
        console.log("✔ Bot launched");
    } catch (err) {
        console.error("❌ Bot failed to launch:", err);
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`✔ Server running on port ${PORT}`);
    });
})();