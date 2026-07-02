import { BOT_TOKEN, CHANNEL_ID, LOCAL_TELEGRAM_API_SERVER } from "../config/env.js";
import { Telegraf, Markup, Telegram } from "telegraf";
import crypto from "crypto";

// Stores temporary download configurations
export const downloadCache = new Map()

// Helper function to format duration seconds into HH:MM:SS or MM:SS
const formatDuration = (seconds) => {
    if (!seconds) return "Unknown";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to cleanly format big numeric metrics (e.g. 1500300 -> 1.5M)
const formatMetric = (num) => {
    if (!num) return "N/A";
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
};

export const bot = new Telegraf(BOT_TOKEN, {
    telegram: {
        apiRoot: LOCAL_TELEGRAM_API_SERVER
    }
});

export const telegram = bot.telegram;

export const joinedTelegram = async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        if (!["creator", "administrator", "member"].includes(member.status)) {
            await ctx.reply(
                `🔐 To use this bot, you must join our official channel:\nJoin the channel and send the link again.`,
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
        // Validate request body exists and is an object
        if (!req.body || typeof req.body !== 'object') {
            console.warn('⚠️ Invalid webhook payload received');
            return res.status(400).json({ error: 'Invalid payload' });
        }

        await bot.handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Telegram webhook error:', err.message);
        // Always return 200 to prevent Telegram from retrying invalid updates
        res.sendStatus(200);
    }
};

export const sendMetadata = async (ctx, videoData, metadataMsg, videoUrl) => {
    const videoQualities = videoData.videoQualities || [];

    if (videoQualities.length === 0) {
        return ctx.telegram.editMessageText(
            ctx.chat.id,
            metadataMsg.message_id,
            null,
            "❌ *Download Failed*\n\nThere are no downloadable video profiles available for this link.",
            { parse_mode: "Markdown" }
        );
    }

    // Build quality selection buttons dynamically
    const qualityButtons = videoQualities.map(v =>
        Markup.button.callback(
            `🎬 ${v.label} (${v.sizeMB} MB)`,
            `dl:${generateFormatId(v, videoData.bestAudio, false, videoUrl, videoData.title)}`
        )
    );

    // Add the audio option to the end of the button pool if it exists
    if (videoData.bestAudio) {
        qualityButtons.push(
            Markup.button.callback(
                `🎵 Audio (${videoData.bestAudio.sizeMB} MB)`,
                `dl:${generateFormatId(videoQualities[0], videoData.bestAudio, true, videoUrl, videoData.title)}`
            )
        );
    }

    // Organize layout smoothly (2 items per row max for a mobile-friendly grid balance)
    const keyboardRows = [];
    const buttonsCopy = [...qualityButtons]; // Prevent mutating original array
    while (buttonsCopy.length > 0) {
        keyboardRows.push(buttonsCopy.splice(0, 2));
    }

    // Build a metadata media presentation caption
    const cleanTitle = videoData.title ? videoData.title.replace(/[*_`[\]]/g, '') : "Untitled Media";
    const cleanChannel = videoData.channel ? videoData.channel.replace(/[*_`[\]]/g, '') : "Unknown Channel";

    const messageText =
        `🎥 *${cleanTitle}*

ℹ️ *Media Insights:*
\`\`\`text
👤 Creator:  ${cleanChannel}
⏱️ Duration: ${formatDuration(videoData.duration)}
👁️ Views:    ${formatMetric(videoData.view_count)}
💬 Comments: ${formatMetric(videoData.comment_count)}
\`\`\`
⚡ *Select your preferred file format below to begin downloading:*`;

    const thumbnail = videoData.thumbnail;

    // Render Pipeline Engine
    if (thumbnail) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, metadataMsg.message_id);
        } catch (err) {
            console.error("Failed to delete initial message placeholder:", err);
        }

        await ctx.replyWithPhoto(
            thumbnail,
            {
                caption: messageText,
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard(keyboardRows)
            }
        );
    } else {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            metadataMsg.message_id,
            null,
            messageText,
            {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard(keyboardRows)
            }
        );
    }
};

const generateFormatId = (videoQualityData, bestAudio, isAudio, videoUrl, title) => {
    const bestAudioId = bestAudio ? bestAudio.formatId : "251";
    let formatArgument = "";
    let expectedExt = "mp4"; // Default fallback

    if (isAudio) {
        formatArgument = bestAudioId;
        expectedExt = bestAudio ? bestAudio.ext : "webm"
    } else {
        if (videoQualityData.acodec !== "none") {
            formatArgument = videoQualityData.formatId;
            expectedExt = videoQualityData.ext || "mp4";
        } else {
            formatArgument = `${videoQualityData.formatId}+${bestAudioId}`;
            // When merging separate video and audio streams into stdout,
            // it's safest to force a standard container format like mp4 or mkv
            expectedExt = "mp4";
        }
    }

    // Generate a short, unique 8-character string
    const shortId = crypto.randomBytes(4).toString("hex");

    // Store the data in your cache map
    downloadCache.set(shortId, {
        format: formatArgument,
        ext: expectedExt,
        title: title,
        url: videoUrl,
        isAudio,
        createdAt: Date.now()
    });

    return shortId;
};


// Global error handler for middleware & polling loops
bot.catch((err, ctx) => {
    console.error(`❌ Telegraf encountered an error for ${ctx?.updateType || 'unknown update'}:`, err);
});