import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../config/constants.js";
import { safeTelegramCall } from "../utils/telegram.js";
import { incrementUserLimit } from "../utils/rateLimit.js";

const cookiePath = path.resolve("./bin/youtube-cookies.txt");

function spawnYtdlp(ytdlpPath, args) {
    if (fs.existsSync(cookiePath)) {
        args.unshift("--cookies", cookiePath);
    }
    const ytdlp = spawn(ytdlpPath, args);

    ytdlp.stderr.on("data", (data) => {
        console.error("yt-dlp stderr:", data.toString());
    });

    ytdlp.on("error", (err) => {
        console.error("Spawn error:", err);
    });

    return ytdlp;
}

export const handleYouTube = (ctx, url, parsed, userId, loadingMsg, ytdlpPath, info) => {
    const progressive = info.formats.find(f => f.format_id === "22") || info.formats.find(f => f.format_id === "18");
    if (progressive) {
        console.log("From progressive url " + progressive.format_id)
        return (async () => {
            await safeTelegramCall(
                ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "🚀 Video ready! Sending…")
            );
            await ctx.replyWithVideo(
                { url: progressive.url },
                { caption: `🎬 ${parsed.title}\n👤 ${parsed.uploader || ""}` }
            );
            // await incrementUserLimit(userId);
            return safeTelegramCall(ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id));
        })();
    }

    const tempPath = path.join(TEMP_DIR, `youtube_${Date.now()}.mp4`);
    let args = [url, "-f", "bestvideo+bestaudio", "--merge-output-format", "mp4", "-o", tempPath];

    const ytdlp = spawnYtdlp(ytdlpPath, args);

    ytdlp.on("close", async (code) => {
        if (code !== 0 || !fs.existsSync(tempPath)) {
            args = [url, "-f", "best", "--merge-output-format", "mp4", "-o", tempPath];
            const retry = spawnYtdlp(ytdlpPath, args);

            retry.on("close", async (retryCode) => {
                if (retryCode !== 0 || !fs.existsSync(tempPath)) {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    return safeTelegramCall(
                        ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to download YouTube video.")
                    );
                }
                console.log("From retry")
                await sendVideo(ctx, parsed, userId, loadingMsg, tempPath);
            });
            return;
        }
        console.log("From fallback")
        await sendVideo(ctx, parsed, userId, loadingMsg, tempPath);
    });
};

async function sendVideo(ctx, parsed, userId, loadingMsg, tempPath) {
    const finalMB = fs.statSync(tempPath).size / (1024 * 1024);
    if (finalMB > 50) {
        fs.unlinkSync(tempPath);
        return safeTelegramCall(
            ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⚠️ Video too large (${finalMB.toFixed(1)}MB)`)
        );
    }

    await safeTelegramCall(
        ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "🚀 Video ready! Sending…")
    );
    await ctx.replyWithVideo({ source: tempPath }, { caption: `🎬 ${parsed.title}\n👤 ${parsed.uploader || ""}` });
    // await incrementUserLimit(userId);

    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    await safeTelegramCall(ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id));
}