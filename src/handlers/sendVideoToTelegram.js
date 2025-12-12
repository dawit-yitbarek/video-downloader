import fs from "fs";
import { safeTelegramCall } from "../utils/telegram.js";
import { logError, logSuccess } from "../utils/logger.js";

export const sendVideoToTelegram = async (ctx, tempPath, loadingMsg) => {
    try {
        // Check if the video file size is under the 50MB limit
        const finalMB = fs.statSync(tempPath).size / (1024 * 1024);
        if (finalMB > 50) {
            fs.unlinkSync(tempPath);
            logError("[Telegram]", `Video too large (${finalMB.toFixed(1)}MB)`);
            await safeTelegramCall(ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⚠️ Video too large (${finalMB.toFixed(1)}MB)`));
            return;
        }

        await safeTelegramCall(ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "🚀 Video ready! Sending…"));

        await ctx.replyWithVideo(
            { source: tempPath },
            { caption: "🎬 Here's your video!" }
        );

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        await safeTelegramCall(ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id));

        logSuccess("[Telegram]", "Video sent successfully!");

    } catch (err) {
        console.error("Error while sending video:", err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        await safeTelegramCall(ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to send video."));
    }
};