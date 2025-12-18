import { spawn } from "child_process";
import crypto from "crypto";
import { B2_BUCKET_NAME, BACKEND_URL } from "../config/env.js";

const isPinterest = (url) =>
    url.includes("pinterest.com") || url.includes("pin.it");

export function uploadVideoToB2(videoUrl, cookiePath) {
    const remote = "b2";
    const fileName = `${crypto.randomBytes(12).toString("hex")}.mp4`;
    const fullPath = `${remote}:${B2_BUCKET_NAME}/${fileName}`;


    const format = isPinterest(videoUrl)
        ? "bv*+ba/b"
        : "best[ext=mp4]/best";

    return new Promise((resolve, reject) => {
        const ytdlp = spawn("yt-dlp", [
            "-f", format,
            "--cookies", cookiePath,
            "-o", "-",
            videoUrl,
        ]);

        const rcloneUpload = spawn("rclone", ["rcat", fullPath]);

        ytdlp.stdout.pipe(rcloneUpload.stdin);
        ytdlp.stderr.pipe(process.stderr);
        rcloneUpload.stderr.pipe(process.stderr);

        const cleanup = () => {
            ytdlp?.kill("SIGKILL");
            rcloneUpload?.kill("SIGKILL");
        };

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Upload timeout"));
        }, 300000);

        rcloneUpload.on("close", code => {
            clearTimeout(timeout);

            if (code !== 0) {
                cleanup();
                return reject(new Error("B2 upload failed"));
            }

            resolve(`${BACKEND_URL}/download/${fileName}`);
        });

        rcloneUpload.on("error", err => {
            clearTimeout(timeout);
            cleanup();
            reject(err);
        });
    });
}