import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../config/constants.js";

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export function cleanupTempFiles() {
    const now = Date.now();

    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) {
            console.error("❌ Failed to read temp dir:", err);
            return;
        };

        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error("❌ Failed to stat file:", filePath, err);
                    return;
                };

                const age = now - stats.mtimeMs;
                if (age > MAX_AGE_MS) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error("❌ Failed to delete:", filePath, err);
                        } else {
                            console.log(`🧹 Deleted old temp file: ${filePath}`);
                        };
                    });
                };
            });
        });
    });
};