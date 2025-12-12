import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../config/constants.js";
import { logError, logSuccess } from "../utils/logger.js";

export const downloadVideo = (url, ytdlpPath) => new Promise((resolve, reject) => {
    const tempPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
    const cookiePath = path.resolve("./bin/cookies/youtube-cookies.txt");

    const args = ["-f", "bv*+ba/b", "-o", tempPath, "--cookies", cookiePath, url];

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