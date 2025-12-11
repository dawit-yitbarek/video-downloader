import { Telegraf } from "telegraf";
import { TELEGRAM_BOT_TOKEN } from "../config/env.js";
import { videoHandler } from "./handlers/videoHandler.js";
import { loadRateLimits } from "../utils/rateLimit.js";

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.start((ctx) => ctx.reply(
    "👋 Welcome! I can download videos from TikTok, Instagram and YouTube.\n\nJust send me a link and I will download it 🚀",
    { parse_mode: "Markdown" }
));

bot.command("help", (ctx) =>
    ctx.reply(
        "📘 *How to Use*\n\n• Send any video link\n• You must join our telegram channel",
        { parse_mode: "Markdown" }
    )
);

// bot.command("stats", async (ctx) => {
//     // const data = await loadRateLimits();
//     const today = data[ctx.from.id]?.count || 0;
//     await ctx.reply(`📈 *Your Stats*\nDownloads today: *${today}*\nRemaining: *${20 - today}*`, { parse_mode: "Markdown" });
// });

// Attach video handler
videoHandler(bot);

// Catch-all
bot.on("text", (ctx) => ctx.reply("Send me any video link — I will download it 🚀"));

export default bot;