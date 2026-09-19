import { Context, type NextFunction, InlineKeyboard } from 'grammy';
import { isChannelMember } from '../../services/telegram.service.js';
import { env } from '../../config/env.js';
import { notifyAdminError } from '../../utils/logger.js';
const channelUrl = `https://t.me/${env.CHANNEL_ID.replace("@", "")}`;

export async function channelCheckMiddleware(
    ctx: Context,
    next: NextFunction
): Promise<void> {
    // Ignore updates without a user (e.g., automated channel posts)
    if (!ctx.from) {
        return next();
    }

    const userId = ctx.from.id;
    const isMember = await isChannelMember(
        ctx.api,
        userId,
    );

    if (isMember) {
        return next();
    }

    // User is NOT a member -> block request & prompt to join
    const joinKeyboard = new InlineKeyboard()
        .url('📢 Join Channel', channelUrl)

    const text = `🔐 *To use this bot, you must join our official channel*\n\nJoin the channel and send the link again.`;

    try {
        await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: joinKeyboard,
        });
    } catch (error: any) {
        console.warn(`[Bot Middleware] Failed to send join prompt to user ${userId}: ${error.message || error}`);
        notifyAdminError(error, 'channelCheckMiddleware');
    }
}