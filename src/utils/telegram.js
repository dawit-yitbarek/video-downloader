import { CHANNEL_ID } from "../config/constants.js";
import { Markup } from "telegraf";

export const safeTelegramCall = async (promise) => {
    try { return await promise; }
    catch (err) { console.log("Telegram API error:", err.message); return null; }
};

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
    } catch {
        await ctx.reply("Something went wrong. Try again.");
        return false;
    }
};