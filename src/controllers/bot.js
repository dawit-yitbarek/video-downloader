import { Telegraf } from "telegraf";
import { TELEGRAM_BOT_TOKEN } from "../config/env.js";
import { videoHandler } from "./controller.js";

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.start((ctx) => ctx.reply(
    "👋 Welcome! I can download videos from TikTok, Instagram, YouTube, Twitter, Facebook and Pinterest.\n\nJust send me a link and I will download it 🚀",
    { parse_mode: "Markdown" }
));

bot.command("help", (ctx) =>
    ctx.reply(
        "📘 *How to Use*\n\n• Send any video link\n• You must join our telegram channel",
        { parse_mode: "Markdown" }
    )
);

// Attach video handler
videoHandler(bot);

// Catch-all
bot.on("text", (ctx) => ctx.reply("Send me any video link — I will download it 🚀"));

export const handleTelegramUpdate = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Telegram webhook error:', err.message);
        res.sendStatus(500);
    }
};

export default bot;