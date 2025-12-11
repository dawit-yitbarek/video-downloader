import path from "path";
import { getVideoInfo } from "../../utils/getVideoInfo.js";
import { parseVideoInfo } from "../../utils/parsers.js";
import { safeTelegramCall, joinedTelegram } from "../../utils/telegram.js";
import { checkUserLimit } from "../../utils/rateLimit.js";
import { handleTikTok } from "../../platforms/tiktok.js";
import { handleInstagram } from "../../platforms/instagram.js";
import { handleYouTube } from "../../platforms/youtube.js";
import { NODE_ENV } from "../../config/env.js";

const isProduction = NODE_ENV === "production";
const ytdlpPath = isProduction ? path.resolve("./bin/yt-dlp") : "yt-dlp";

export const videoHandler = (bot) => {
    bot.hears(/(https?:\/\/[^\s]+)/, async (ctx) => {
        const userId = ctx.from.id;
        const url = ctx.match[1];

        if (!await joinedTelegram(ctx)) return;
        // if (!(await checkUserLimit(userId))) {
        //     return ctx.reply("😕 You’ve reached your daily limit of 20 downloads. Come back tomorrow 🚀");
        // }

        const loadingMsg = await ctx.reply("⏳ Fetching video info…");

        try {
            const info = await getVideoInfo(url);
            if (!info) {
                return safeTelegramCall(
                    ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to fetch video info.")
                );
            }

            const parsed = parseVideoInfo(info);
            if (!parsed || !parsed.video?.url) {
                return safeTelegramCall(
                    ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Unsupported platform or format.")
                );
            }

            const fileSize = parsed.video.filesize;
            console.log("Video file size " + (fileSize ? fileSize / (1024 * 1024) : "unknown"))
            if (fileSize && fileSize / (1024 * 1024) > 50) {
                return safeTelegramCall(
                    ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "⚠️ Video too large (>50MB)")
                );
            }

            // Platform-specific handling
            const platform = info.extractor_key?.toLowerCase();
            if (platform === "tiktok") return handleTikTok(ctx, url, parsed, userId, loadingMsg, ytdlpPath);
            if (platform === "instagram") return handleInstagram(ctx, parsed, userId, loadingMsg);
            if (platform === "youtube") return handleYouTube(ctx, url, parsed, userId, loadingMsg, ytdlpPath, info);

            return safeTelegramCall(
                ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Unsupported platform.")
            );
        } catch (err) {
            console.error("Download error:", err);
            safeTelegramCall(
                ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to download.")
            );
        }
    });
};