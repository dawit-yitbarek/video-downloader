import express from "express";
import bot, { handleTelegramUpdate } from "./controllers/bot.js";
import { PORT, NODE_ENV, BACKEND_URL } from "./config/env.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("OK"));
app.post('/telegram', handleTelegramUpdate);

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