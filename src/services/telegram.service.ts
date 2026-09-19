import { Api } from 'grammy';
import { env } from "../config/env.js"
import { notifyAdminError } from '../utils/logger.js';
const { CHANNEL_ID } = env


// Allowed statuses that signify an active subscription/membership.
const ALLOWED_STATUSES = new Set([
    'creator',
    'administrator',
    'member',
]);

// Checks if a specific user is subscribed to a target Telegram channel
export const isChannelMember = async (api: Api, userId: number,): Promise<boolean> => {
    try {
        const member = await api.getChatMember(`@${CHANNEL_ID}`, userId);
        return ALLOWED_STATUSES.has(member.status);
    } catch (error: any) {
        console.error(`[TelegramService] Error checking chat membership for user ${userId} in ${CHANNEL_ID}: ${error.message || error}`);
        notifyAdminError(error, 'isChannelMember');
        return false;
    }
}