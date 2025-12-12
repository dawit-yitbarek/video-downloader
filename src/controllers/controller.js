import path from "path";
import { downloadVideo } from "../handlers/downloadVideo.js";
import { sendVideoToTelegram } from "../handlers/sendVideoToTelegram.js";
import { safeTelegramCall, joinedTelegram } from "../utils/telegram.js";
import { NODE_ENV } from "../config/env.js";
const isProduction = NODE_ENV === "production";
const ytdlpPath = isProduction ? path.resolve("./bin/yt-dlp") : "yt-dlp";

export const videoHandler = async (bot) => {
    bot.hears(/(https?:\/\/[^\s]+)/, async (ctx) => {
        const url = ctx.match[1];

        if (!await joinedTelegram(ctx)) return;

        const loadingMsg = await ctx.reply("⏳ Fetching video info…");


        try {
            // downloading video
            const tempPath = await downloadVideo(url, ytdlpPath);

            // Send video to Telegram
            await sendVideoToTelegram(ctx, tempPath, loadingMsg);

        } catch (error) {
            console.error("Error handling video download and send:", error);
            await safeTelegramCall(ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ An error occurred while processing the video."));
        }
    });
};