import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../config/constants.js";
import { safeTelegramCall } from "../utils/telegram.js";
import { incrementUserLimit } from "../utils/rateLimit.js";

export const handleTikTok = (ctx, url, parsed, userId, loadingMsg, ytdlpPath) => {
    const tempPath = path.join(TEMP_DIR, `tiktok_${Date.now()}.mp4`);

    const args = [
        url,
        "-f", "mp4",
        "-o", tempPath
    ];

    const ytdlp = spawn(ytdlpPath, args);

    ytdlp.stderr.on("data", (data) => {
        const msg = data.toString();
        if (msg.trim()) console.log("[yt-dlp TikTok]", msg.trim());
    });

    ytdlp.on("close", async (code) => {
        try {
            if (code !== 0 || !fs.existsSync(tempPath)) {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                return safeTelegramCall(
                    ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to download TikTok video.")
                );
            }

            const finalMB = fs.statSync(tempPath).size / (1024 * 1024);
            if (finalMB > 50) {
                fs.unlinkSync(tempPath);
                return safeTelegramCall(
                    ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⚠️ Video too large (${finalMB.toFixed(1)}MB)`)
                );
            }

            await safeTelegramCall(
                ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "🚀 Video ready! Sending…")
            );

            await ctx.replyWithVideo(
                { source: tempPath },
                { caption: `🎬 ${parsed.title}\n👤 ${parsed.uploader || ""}` }
            );

            // await incrementUserLimit(userId);

            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await safeTelegramCall(ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id));
        } catch (err) {
            console.error("TikTok send error:", err);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await safeTelegramCall(
                ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to send TikTok video.")
            );
        }
    });
};