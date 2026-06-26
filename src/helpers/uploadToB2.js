import { spawn } from "child_process";
import crypto from "crypto";
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import { B2_BUCKET_NAME, BACKEND_URL } from "../config/env.js";

export function uploadVideoToB2(tempFilePath) {
    const remote = "b2";
    const fileName = `${crypto.randomBytes(12).toString("hex")}.mp4`;
    const fullPath = `${remote}:${B2_BUCKET_NAME}/${fileName}`;

    return new Promise((resolve, reject) => {
        const rcloneUpload = spawn("rclone", ["rcat", fullPath]);

        // Pipe the completed local temporary file into rclone
        const localFileStream = createReadStream(tempFilePath);
        localFileStream.pipe(rcloneUpload.stdin);

        rcloneUpload.stderr.pipe(process.stderr);

        const cleanup = async () => {
            rcloneUpload?.kill("SIGKILL");
            await unlink(tempFilePath).catch(() => { });
        };

        rcloneUpload.on("close", async (code) => {
            // eliminate the local temp file after upload finishes
            await unlink(tempFilePath).catch(() => { });

            if (code !== 0) {
                return reject(new Error(`B2 upload failed with code ${code}`));
            }

            resolve(`${BACKEND_URL}/download/${fileName}`);
        });

        rcloneUpload.on("error", async (err) => {
            await cleanup();
            reject(err);
        });
    });
}