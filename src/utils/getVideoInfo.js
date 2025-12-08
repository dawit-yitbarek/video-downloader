import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NODE_ENV } from "../config/env.js";
const isProduction = NODE_ENV === "production";

const cookiePath = path.resolve("./src/bin/cookies.txt");
const ytdlpPath = isProduction ? path.resolve("./src/bin/yt-dlp") : "yt-dlp";

export const getVideoInfo = (url) => new Promise((resolve) => {
    let jsonText = "";
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