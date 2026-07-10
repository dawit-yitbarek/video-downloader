import { Telegraf, Markup } from "telegraf";
import { BOT_TOKEN, CHANNEL_ID, LOCAL_TELEGRAM_API_SERVER } from "../config/env.js";
import logger from "./logger.js";

export const bot = new Telegraf(BOT_TOKEN, {
    telegram: { apiRoot: LOCAL_TELEGRAM_API_SERVER }
});

export const telegram = bot.telegram;

// Enforces subscription channel before accepting work
export const joinedTelegram = async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        const activeStatuses = ["creator", "administrator", "member"];

        if (!activeStatuses.includes(member.status)) {
            const clearChannelHandle = CHANNEL_ID.replace("@", "");
            await ctx.reply(
                `🔐 *To use this bot, you must join our official channel*\n\nJoin the channel and send the link again.`,
                Markup.inlineKeyboard([[
                    Markup.button.url("📢 Join Channel", `https://t.me/${clearChannelHandle}`)
                ]])
            );
            return false;
        }
        return true;
    } catch (error) {
        logger.error(`❌ [Telegram Driver] Telegram join check error: ${error.message}`);
        await ctx.reply("⚠️ Something went wrong. Please Try again.");
        return false;
    }
};

//Server Router Callback Interface for Incoming Webhook Engine
export const handleTelegramUpdate = async (req, res) => {
    try {
        // Validate request body exists and is an object
        if (!req.body || typeof req.body !== 'object') {
            logger.warn('⚠️ [Telegram Hook] Invalid webhook payload received');
            return res.status(400).json({ error: 'Invalid payload' });
        }

        await bot.handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        logger.error(`❌ [Telegram Hook] Internal Processing Panic: ${err.message}`);
        res.sendStatus(200); // Always return 200 to prevent Telegram from retrying invalid updates
    }
};

// Global Catch-All Engine Error Safety Interceptor
bot.catch((err, ctx) => {
    logger.error(`❌ Telegraf encountered an error for ${ctx?.updateType || 'unknown update'}: ${err}`);
});