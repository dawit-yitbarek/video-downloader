import express from "express";
import cors from 'cors';
import bot from "./controllers/videoDownloader.js";
import { PORT } from "./config/env.js";
import { ok } from "assert";

const app = express();

app.use(cors({
    origin: true,
    credentials: true,
}));

app.use(express.json());

app.get('/health', (req, res) => res.send('OK'));

(async () => {
    try {
        await bot.launch();
        console.log("✔ Bot launched");
    } catch (err) {
        console.error('Bot failed to launch:', err);
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`✔ Server running on port ${PORT}`);
    });
})()