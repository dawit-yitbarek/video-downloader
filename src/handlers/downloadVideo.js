import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { TEMP_DIR, COOKIE_FILE_PATH } from "../config/constants.js";
import { logError, logSuccess } from "../utils/logger.js";
import { YTDLP_COOKIES } from "../config/env.js";

if (!YTDLP_COOKIES) {
    logError("[yt-dlp]", "Cookie content not found");
    throw new Error("❌ Cookie content not found.");
}

try {
    fs.writeFileSync(COOKIE_FILE_PATH, YTDLP_COOKIES, 'utf-8');
} catch (error) {
    logError("[yt-dlp]", `Failed to write cookies to file: ${error.message}`);
    throw new Error("❌ Failed to write cookies to file.");
}

export const downloadVideo = (url, ytdlpPath) => new Promise((resolve, reject) => {
    const tempPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);


    if (!fs.existsSync(COOKIE_FILE_PATH)) {
        logError("[yt-dlp]", "Cookie file not found.");
        return reject(new Error("❌ Cookie file not found."));
    }

    const args = ["-f", "bv*+ba/b", "-o", tempPath, "--cookies", COOKIE_FILE_PATH, url];

    // Start the yt-dlp process
    const ytdlp = spawn(ytdlpPath, args);

    ytdlp.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) logError("[yt-dlp]", msg);
    });

    ytdlp.stdout.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) logSuccess("[yt-dlp]", msg);
    });

    // Handle process completion
    ytdlp.on("close", (code) => {
        if (code !== 0 || !fs.existsSync(tempPath)) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            logError("[yt-dlp]", `Failed to download video (exit code ${code})`);
            return reject(new Error("❌ Failed to download video. Please try again."));
        }

        logSuccess("[yt-dlp]", `Video downloaded successfully to ${tempPath}`);
        resolve(tempPath);
    });

    // Handle any potential process errors like spawn failure
    ytdlp.on("error", (err) => {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        logError("[yt-dlp]", `Error spawning yt-dlp process: ${err.message}`);
        reject(new Error("❌ An error occurred while trying to start the download."));
    });
});