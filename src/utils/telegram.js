import { TELEGRAM_BOT_TOKEN, CHANNEL_ID } from "../config/env.js";
import { Telegraf, Markup, Telegram } from "telegraf";

export const telegram = new Telegram(TELEGRAM_BOT_TOKEN)
export const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
export const joinedTelegram = async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        if (!["creator", "administrator", "member"].includes(member.status)) {
            await ctx.reply(
                `🔐 To use this bot, you must join our official channel:\nJoin then send the link again.`,
                Markup.inlineKeyboard([[Markup.button.url("📢 Join Channel", `https://t.me/${CHANNEL_ID.replace("@", "")}`)]])
            );
            return false;
        }
        return true;
    } catch (error) {
        console.error("❌ Telegram join check error:", error.message);
        await ctx.reply("Something went wrong. Try again.");
        return false;
    }
};


export const handleTelegramUpdate = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Telegram webhook error:', err.message);
        res.sendStatus(500);
    }
};