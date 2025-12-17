import { spawn } from "child_process";
import crypto from "crypto";

const isPinterest = (url) => {
    return url.includes("pinterest.com") || url.includes("pin.it");
};

export function uploadVideoToMega(videoUrl, cookiePath) {
    const remote = "mega";
    const fileName = `${crypto.randomBytes(12).toString("hex")}.mp4`;
    const remotePath = `Cloud/${fileName}`;
    const fullPath = `${remote}:${remotePath}`;
    const format = isPinterest(videoUrl) ? "bv*+ba/b" : "best[ext=mp4]/best";

    return new Promise((resolve, reject) => {
        // 1️⃣ download → upload stream
        const ytdlp = spawn("yt-dlp", ["-f", format, "--cookies", cookiePath, "-o", "-", videoUrl]);

        const rcloneUpload = spawn("rclone", ["rcat", fullPath]);

        ytdlp.stdout.pipe(rcloneUpload.stdin);

        ytdlp.stderr.pipe(process.stderr);
        rcloneUpload.stderr.pipe(process.stderr);
        const cleanup = () => {
            if (ytdlp) ytdlp.kill("SIGKILL");
            if (rcloneUpload) rcloneUpload.kill("SIGKILL");
        };

        // Timeout for download and upload (5 minutes)
        const uploadTimeout = setTimeout(() => {
            cleanup();
            reject(new Error("Upload to MEGA timeout after 5 minutes"));
        }, 300000);

        rcloneUpload.on("close", code => {
            clearTimeout(uploadTimeout);
            if (code !== 0) {
                console.error("Upload to MEGA failed with code:", code);
                cleanup();
                return reject(new Error("Upload to MEGA failed"));
            }

            console.log("Upload to MEGA successful");

            // 2️⃣ generate public link
            const rcloneLink = spawn("rclone", ["link", fullPath]);

            let linkOutput = "";

            rcloneLink.stdout.on("data", d => linkOutput += d.toString());
            rcloneLink.stderr.pipe(process.stderr);

            // Timeout for link generation (30 seconds)
            const linkTimeout = setTimeout(() => {
                if (rcloneLink) rcloneLink.kill("SIGKILL");
                reject(new Error("MEGA link generation timeout after 30 seconds"));
            }, 30000);

            rcloneLink.on("close", linkCode => {
                clearTimeout(linkTimeout);
                if (linkCode !== 0 || !linkOutput.trim()) {
                    console.error("Failed to generate MEGA link with code:", linkCode);
                    return reject(new Error("Failed to generate MEGA link"));
                }

                const publicUrl = linkOutput.trim();
                console.log("MEGA link generated:", publicUrl);
                resolve(publicUrl);
            });
        });

        rcloneUpload.on("error", (err) => {
            clearTimeout(uploadTimeout);
            cleanup();
            reject(err);
        });
    });
}