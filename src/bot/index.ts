import { Bot, Context } from 'grammy';
import { channelCheckMiddleware } from './middleware/channelCheck.middleware.js';
import { handleMediaMessageListener, handleLinkMessageListener, handleCallbackQuery } from './handlers/botMessageHandler.js';
import { env } from '../config/env.js';
import { sendStatusMessage, sendStartMessage, sendHelpMessage, sendTextMessage } from './helpers/messageSender.js';
import { notifyAdminError } from '../utils/logger.js';


export const bot = new Bot<Context>(env.BOT_TOKEN, {
    client: { apiRoot: env.LOCAL_TELEGRAM_API_SERVER }
});

// Global Error Handler
bot.catch((error) => {
    console.error(`[Bot Error] Exception handling update ${error.ctx.update.update_id}:`, error.error);
    notifyAdminError(error.error, 'Bot Error');
});

// Attach Membership Middleware globally to all subsequent handlers
bot.use(channelCheckMiddleware);

// 1. Commands
bot.command('start', (ctx) => sendStartMessage({ ctx }));
bot.command("help", (ctx) => sendHelpMessage({ ctx }));
bot.command("status", (ctx) => sendStatusMessage({ ctx }));

// 2. Regex / Specific Text Listeners
bot.hears(/(https?:\/\/[^\s]+)/, (ctx) => handleLinkMessageListener({ ctx, label: "720p" }));

// 3. Specific Media Handlers
bot.on('message:video', (ctx) => handleMediaMessageListener({ ctx }));
bot.on('message:audio', (ctx) => handleMediaMessageListener({ ctx }));

// 4. Interactive Callbacks
bot.callbackQuery(/^dl:(.+):(.+)$/, (ctx) => handleCallbackQuery({ ctx }));

// 5. Catch-All for Non-Command, Non-Link Plain Text Messages
bot.on('message:text', (ctx) => sendTextMessage({ ctx }));


export async function initBot() {
    await bot.start({
        onStart: (botInfo) => {
            console.log(`✅ Bot @${botInfo.username} successfully started! Listening for updates...`);
        },
    });
}