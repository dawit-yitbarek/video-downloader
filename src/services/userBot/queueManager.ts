import { TARGET_BOTS, USER_BOT_REQUEST_TIMEOUT } from "../../config/constants.js";
import { userBotClient } from "./messageListener.js";
import type { label, PlatformType } from "../../types/index.js";
import type { Message } from "grammy/types";
import { decideDownlodingTool } from "../mediaHandler.js";
import { notifyAdminError } from "../../utils/logger.js";


export interface ActiveRequest {
    statusMessage: Message.TextMessage;
    url: string
    mediaId: string | null
    platform: PlatformType
    label: label;
    createdAt: number;
    isProcessing?: boolean;
    timer?: NodeJS.Timeout;
}

export interface sendUrlProp {
    statusMessage: Message.TextMessage,
    url: string,
    mediaId: string | null,
    platform: PlatformType,
    label: label
}

interface QueueBot {
    botId: number;
    botUsername: string;
    canHandle: PlatformType[];
    lastUsedAt: number;
}

const botQueue: QueueBot[] = TARGET_BOTS.map((bot) => ({
    botId: bot.id,
    botUsername: bot.username,
    canHandle: bot.canHandle,
    lastUsedAt: 0,
}));

const activeRequests = new Map<number, ActiveRequest>();

/**
 * Checks if at least one bot capable of handling the platform type is idle.
 */
export function hasAvailableBot(platform: PlatformType): boolean {
    const activeBots = Array.from(activeRequests.keys());
    return botQueue.some(
        (b) => b.canHandle.includes(platform) && !activeBots.includes(b.botId)
    );
}

export function getNextAvailableBot(platform: PlatformType): QueueBot | undefined {
    const activeBots = Array.from(activeRequests.keys());
    return botQueue
        .filter((b) => b.canHandle.includes(platform) && !activeBots.includes(b.botId))
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
}

export function setActiveRequest(botId: number, req: ActiveRequest) {
    activeRequests.set(botId, req);
}

export function getActiveRequest(botId: number): ActiveRequest | undefined {
    return activeRequests.get(botId);
}

export function findActiveRequestBySender(senderId: number) {
    const request = activeRequests.get(senderId);
    return request ? { botId: senderId, request } : null;
}

export function clearActiveRequest(botId: number) {
    const req = activeRequests.get(botId);
    if (req?.timer) clearTimeout(req.timer);
    activeRequests.delete(botId);

    const bot = botQueue.find((b) => b.botId === botId);
    if (bot) bot.lastUsedAt = Date.now();
}

export async function sendUrlToTargetBot({
    statusMessage,
    url,
    mediaId,
    platform,
    label,
}: sendUrlProp) {
    let targetBotId: number | undefined;
    const targetBot = getNextAvailableBot(platform);

    try {

        if (!targetBot) {
            await decideDownlodingTool({ statusMessage, mediaId, url, platform, label, skipUserBot: true });
            return;
        }

        targetBotId = targetBot.botId;

        const timer = setTimeout(() => {
            if (activeRequests.has(targetBot.botId)) {
                clearActiveRequest(targetBot.botId);
                decideDownlodingTool({ statusMessage, mediaId, url, platform, label, skipUserBot: true });
            }
        }, USER_BOT_REQUEST_TIMEOUT);

        setActiveRequest(targetBotId, {
            statusMessage,
            url,
            mediaId,
            platform,
            label,
            createdAt: Date.now(),
            timer,
        });

        await userBotClient.sendMessage(targetBot.botId, { message: url });
    } catch (error: any) {
        console.error(`[user-bot] failed to send url to target bot ${targetBot?.botUsername}: ${error?.message || error}`);
        if (targetBotId) {
            clearActiveRequest(targetBotId);
        }
        notifyAdminError(error, 'sendUrlToTargetBot');
        await decideDownlodingTool({ statusMessage, mediaId, url, platform, label, skipUserBot: true });
    }
}