import { bot } from '../bot/index.js';
import { env } from '../config/env.js';

const { ADMIN_CHAT_ID } = env;
const RATE_LIMIT_DELAY_MS = 1500; // Wait 1.5s between Telegram API calls

// In-Memory state
const alertQueue: Array<{ text: string }> = [];
let isProcessingQueue = false;

const sanitizeErrorMessage = (message: string): string => {
    const commandPattern = /Command failed:\s*yt-dlp[\s\S]*?(https?:\/\/[^\s\n]+)/g;
    return message
        .replace(commandPattern, (match, url) => `Command failed: yt-dlp [args truncated] ${url}`)
        .trim();
};

const processAlertQueue = async () => {
    if (isProcessingQueue || alertQueue.length === 0 || !ADMIN_CHAT_ID) return;

    isProcessingQueue = true;

    while (alertQueue.length > 0) {
        const item = alertQueue.shift();
        if (!item) continue;

        try {
            await bot.api.sendMessage(ADMIN_CHAT_ID, item.text, {
                parse_mode: 'Markdown',
                link_preview_options: { is_disabled: true },
            });
        } catch (error: any) {
            // Fallback for Markdown parse failures or network hiccups
            console.error(`[Admin Notifier] Markdown error alert failed: ${error.message || error}`);
            await bot.api.sendMessage(ADMIN_CHAT_ID, item.text, {
                link_preview_options: { is_disabled: true },
            }).catch((error) => {
                console.error(`[Admin Notifier] Plain text error alert also failed: ${error.message || error}}`);
            });
        }

        // Throttle to respect Telegram rate limits
        if (alertQueue.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
    }

    isProcessingQueue = false;
};

export const notifyAdminError = async (error: any, context?: string): Promise<void> => {
    if (!ADMIN_CHAT_ID || !error) return;

    const rawMessage = String(error.message || error);
    const cleanedMessage = sanitizeErrorMessage(rawMessage);

    // Format Message
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Etc/GMT-3',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
    const timestamp = `${parts.month} ${parts.day} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} (UTC+3)`;
    const maxLength = 3500;
    const truncatedMessage = cleanedMessage.length > maxLength
        ? `${cleanedMessage.substring(0, maxLength)}\n\n... [Truncated]`
        : cleanedMessage;

    const header = context ? `🚨 *ERROR ALERT* - \`${context}\`` : `🚨 *ERROR ALERT*`;
    const alertText = `${header}\n📅 *Time:* \`${timestamp}\`\n\n\`\`\`text\n${truncatedMessage}\n\`\`\``;

    // Push to in-memory queue & process
    alertQueue.push({ text: alertText });
    processAlertQueue();
};