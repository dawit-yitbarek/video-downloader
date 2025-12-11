import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NODE_ENV } from "../config/env.js";
const isProduction = NODE_ENV === "production";

const ytCookiePath = path.resolve("./bin/youtube-cookies.txt");
const igCookiePath = path.resolve("./bin/instagram-cookies.txt");
const ytdlpPath = isProduction ? path.resolve("./bin/yt-dlp") : "yt-dlp";

export const getVideoInfo = (url) => new Promise((resolve) => {
    let jsonText = "";
    let cookiePath = null;
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
        cookiePath = ytCookiePath;
    } else if (url.includes("instagram.com") || url.includes("instagr.am")) {
        cookiePath = igCookiePath;
    }

    const args = ["--dump-single-json", url];
    if (fs.existsSync(cookiePath)) args.unshift("--cookies", cookiePath);
    args.push("--extractor-args", "youtube:player_client=default");

    const infoProcess = spawn(ytdlpPath, args);

    infoProcess.stdout.on("data", (data) => { jsonText += data.toString(); });
    infoProcess.stderr.on("data", (data) => { console.error("yt-dlp stderr:", data.toString()); });

    infoProcess.on("close", () => {
        try { resolve(JSON.parse(jsonText.trim())); }
        catch { resolve(null); }
    });
});