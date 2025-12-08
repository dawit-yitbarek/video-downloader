import { safeTelegramCall } from "../utils/telegram.js";
import { incrementUserLimit } from "../utils/rateLimit.js";

export const handleInstagram = async (ctx, parsed, userId, loadingMsg) => {
    await safeTelegramCall(
        ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "🚀 Video ready! Sending…")
    );
    await ctx.replyWithVideo(
        { url: parsed.video.url },
        { caption: `🎬 ${parsed.title}\n👤 ${parsed.uploader || ""}` }
    );
    await incrementUserLimit(userId);
    return safeTelegramCall(ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id));
};