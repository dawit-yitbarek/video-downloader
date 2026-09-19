import type { Context } from "grammy";
import type { label, PlatformType } from "../../types/index.js";
import { normalizeChatId } from "../../utils/normalizeChatId.js";
import { env } from "../../config/env.js";
import { sendSingleMedia, sendMediaErrorMessage } from "../helpers/messageSender.js";
import { handleMediaDownload } from "../../services/mediaHandler.js";
import { increaseRateLimit, setMediaCache } from "../../services/redis.service.js"
import { notifyAdminError } from "../../utils/logger.js";

export async function handleMediaMessageListener({ ctx }: { ctx: Context }) {

    if (!ctx.chat?.id) return;
    const incomingId = normalizeChatId(ctx.chat.id);
    const expectedId = normalizeChatId(env.PRIVATE_GROUP_ID!);
    if (incomingId !== expectedId) return;
    const caption = ctx.message?.caption || "";

    // 1. Updated Regex to capture [TRACK:chatId:statusMessageId:platform:mediaId:label]
    const trackIdRegex = /\[TRACK:([^:]*):([^:]*):([^:]*):([^:]*):([^:]*)\]/;
    const match = caption.match(trackIdRegex);

    if (!match) {
        console.log(`⚠️ Intercepted a group video, but it did not contain a valid [TRACK] string: ${caption}`);
        return;
    }

    // 2. Extract information from the match capture groups
    const targetChatId = parseInt(match[1]!, 10);
    const statusMessageId = parseInt(match[2]!, 10);
    const platform = match[3]! as PlatformType;
    const mediaId = match[4]!;
    const targetLabel = match[5]! as label;

    const fileId = targetLabel === "audio" ? ctx.message?.audio?.file_id : ctx.message?.video?.file_id;
    if (!fileId) return;

    try {
        // 3. Deliver the video/audio directly to the user
        await sendSingleMedia({ chatId: targetChatId, messageId: statusMessageId, label: targetLabel, source: fileId })
        await setMediaCache({ mediaId, platform, fileId, label: targetLabel })
        await increaseRateLimit(targetChatId)
    } catch (error: any) {
        const errorMessage = error.message || error
        console.error(`[mediaMessageHandler] ❌ Failed to deliver ${targetLabel} to chat session ${targetChatId}: ${errorMessage}`);
        await sendMediaErrorMessage({ chatId: targetChatId, messageId: statusMessageId, label: targetLabel, errorMessage })
        notifyAdminError(error, 'Media message listener');
    }
}

export async function handleLinkMessageListener({ ctx, label }: { ctx: Context, label: label }) {
    const text = ctx.message?.text;
    if (!text) return;
    const URL_REGEX = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(URL_REGEX);
    if (!matches || matches.length === 0) return;

    const url = matches[0];
    await handleMediaDownload({ ctx, label, url })
}

export async function handleCallbackQuery({ ctx }: { ctx: Context }) {
    // Always answer the callback query to remove the loading spinner on the button
    await ctx.answerCallbackQuery().catch((error) => console.error(`[CallbackQuery] Failed to handle CallbackQuery: ${error.message || error}`));

    if (!ctx.match) return;
    // Extract the URL and quality from the regex match groups
    const url = ctx?.match[1];
    const label = ctx.match[2] as label || "720p";
    if (!url) return;
    await handleMediaDownload({ url, ctx, label, skipYoutubeCheck: true })
}