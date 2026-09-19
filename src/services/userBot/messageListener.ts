import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import { EditedMessage, EditedMessageEvent } from "telegram/events/EditedMessage.js";
import { env } from "../../config/env.js";
import { TARGET_BOT_ERROR_REGEX, TARGET_BOTS } from "../../config/constants.js";
import { findActiveRequestBySender, clearActiveRequest, type ActiveRequest } from "./queueManager.js";
import { handleButtonClick } from "./buttonHandler.js";
import { decideDownlodingTool } from "../mediaHandler.js";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { label, PlatformType } from "../../types/index.js";
import { notifyAdminError } from "../../utils/logger.js";
type TargetBotEvent = NewMessageEvent | EditedMessageEvent;

// 1. Initialize the client using GramJS classes
const TARGET_BOTS_USERNAME = TARGET_BOTS.map(({ username }) => username)
const stringSession = new StringSession(env.TELEGRAM_SESSION_STRING);

export const userBotClient = new TelegramClient(stringSession, env.TELEGRAM_API_ID, env.TELEGRAM_API_HASH, {
    connectionRetries: 5,
});

export async function setupUserBotListeners() {
    try {
        userBotClient.addEventHandler(
            handleTargetBotMessage,
            new NewMessage({ chats: TARGET_BOTS_USERNAME })
        );

        userBotClient.addEventHandler(
            handleTargetBotMessage,
            new EditedMessage({ chats: TARGET_BOTS_USERNAME })
        );
    } catch (error: any) {
        console.error(`[user-bot] Error setting up user-bot listeners: ${error.message || error}`);
        notifyAdminError(error, 'setupUserBotListeners');
    }
}

async function handleTargetBotMessage(event: TargetBotEvent) {
    let activeRequest: ActiveRequest | undefined = undefined;
    try {
        const message = event.message;
        if (!message) return;

        const senderId = message.senderId ? Number(message.senderId) : undefined;
        if (!senderId) return;
        const active = findActiveRequestBySender(senderId);
        if (!active) return;

        const { botId, request } = active;
        const textToTest = message.text || "";
        activeRequest = request;
        let mimeType = "";
        if (
            message.media instanceof Api.MessageMediaDocument &&
            message.media.document instanceof Api.Document
        ) {
            mimeType = message.media.document.mimeType;
        }

        const isVideoOrAudio =
            Boolean(message.video || message.audio) ||
            mimeType.startsWith("video/") ||
            mimeType.startsWith("audio/");

        // 1. Success: Media received
        if (message.media && isVideoOrAudio) {
            if (request.isProcessing) return;
            request.isProcessing = true;

            clearActiveRequest(botId);

            const trackingTag = createInvisibleTag(request.statusMessage.chat.id, request.statusMessage.message_id, request.platform, request.mediaId, request.label);

            if (!env.PRIVATE_GROUP_ID) {
                throw new Error("[user-bot] PRIVATE_GROUP_ID is not configured");
            }
            await userBotClient.sendFile(env.PRIVATE_GROUP_ID, {
                file: message.media,
                caption: trackingTag,
                parseMode: "html",
            });
            return;
        }

        // 2. Target Bot Error Response
        if (!isVideoOrAudio && textToTest && TARGET_BOT_ERROR_REGEX.test(textToTest)) {
            clearActiveRequest(botId);
            const { statusMessage, mediaId, url, platform, label } = request;
            await decideDownlodingTool({ statusMessage, mediaId, url, platform, label, skipUserBot: true });
            return;
        }

        // 3. Handle Intermediate Action Buttons
        if (message.buttons && !isVideoOrAudio) {
            await handleButtonClick(message, request.label);
        }
    } catch (error: any) {
        console.error(`[user-bot] failed to hande user-bot event: ${error?.message || error}`);
        if (activeRequest) {
            const { statusMessage, mediaId, url, platform, label } = activeRequest;
            await decideDownlodingTool({ statusMessage, mediaId, url, platform, label, skipUserBot: true });
        }
        notifyAdminError(error, 'handleTargetBotMessage');
    }
}

function createInvisibleTag(
    chatId: number,
    messageId: number,
    platform: PlatformType,
    mediaId: string | null,
    label: label
): string {
    return `<a href="tg://user?id=${chatId}">&#8203;</a>[TRACK:${chatId}:${messageId}:${platform}:${mediaId ?? ''}:${label}]`;
}