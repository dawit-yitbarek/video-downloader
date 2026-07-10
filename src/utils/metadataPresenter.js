import crypto from "crypto";
import { Markup } from "telegraf";
import { formatDuration, formatMetric } from "../helpers/formatters.js";

// Stores temporary download configurations
export const downloadCache = new Map();

function createUniqueDownloadSession(videoQualityData, bestAudio, isAudio, videoUrl, title) {
    const bestAudioId = bestAudio ? bestAudio.formatId : "251";
    let formatArgument = "";
    let expectedExt = "mp4";

    if (isAudio) {
        formatArgument = bestAudioId;
        expectedExt = bestAudio ? bestAudio.ext : "webm";
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

    const sessionToken = crypto.randomBytes(4).toString("hex");

    downloadCache.set(sessionToken, {
        label: isAudio ? "audio" : videoQualityData.label,
        format: formatArgument,
        ext: expectedExt,
        title: title,
        url: videoUrl,
        isAudio,
        createdAt: Date.now()
    });

    return sessionToken;
}

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

    // Map dynamic qualities directly to callback frames
    const buttons = videoQualities.map(v => {
        const sessionId = createUniqueDownloadSession(v, videoData.bestAudio, false, videoUrl, videoData.title);
        return Markup.button.callback(`🎬 ${v.label} (${v.sizeMB} MB)`, `dl:${sessionId}`);
    });

    if (videoData.bestAudio) {
        const audioSessionId = createUniqueDownloadSession(videoQualities[0], videoData.bestAudio, true, videoUrl, videoData.title);
        buttons.push(Markup.button.callback(`🎵 Audio (${videoData.bestAudio.sizeMB} MB)`, `dl:${audioSessionId}`));
    }

    // Organize layout smoothly (2 items per row max for a mobile-friendly grid balance)f
    const gridRows = [];
    while (buttons.length > 0) {
        gridRows.push(buttons.splice(0, 2));
    }

    const cleanTitle = videoData.title ? videoData.title.replace(/[*_`[\]]/g, '') : "Untitled Media";
    const cleanChannel = videoData.channel ? videoData.channel.replace(/[*_`[\]]/g, '') : "Unknown Channel";

    const textCaption = `🎥 *${cleanTitle}*

ℹ️ *Media Insights:*
\`\`\`text
👤 Creator:  ${cleanChannel}
⏱️ Duration: ${formatDuration(videoData.duration)}
👁️ Views:    ${formatMetric(videoData.view_count)}
💬 Comments: ${formatMetric(videoData.comment_count)}
\`\`\`
⚡ *Select your preferred file format below to begin downloading:*`;

    if (videoData.thumbnail) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, metadataMsg.message_id);
        } catch (_) { }

        await ctx.replyWithPhoto(videoData.thumbnail, {
            caption: textCaption,
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(gridRows)
        });
    } else {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            metadataMsg.message_id,
            null,
            textCaption,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard(gridRows) }
        );
    }
};