import { spawn } from "child_process";
import { COOKIE_PATH } from "../config/constants.js";
import logger from "../utils/logger.js";


const calculateMegabytes = (streamPayload) => {
    const rawBytes = streamPayload.filesize || streamPayload.filesize_approx || 0;
    return rawBytes > 0 ? (rawBytes / (1024 * 1024)).toFixed(2) : "Unknown";
};

export const getVideoMetaData = (videoUrl) => {
    return new Promise((resolve, reject) => {
        let downloadTimeout = null;
        let isSettled = false;

        const ytdlp = spawn("yt-dlp", [
            "--dump-json",
            "--cookies", COOKIE_PATH,
            "--js-runtimes", "node",
            "--remote-components", "ejs:github",
            videoUrl
        ]);

        // Unified Cleanup function
        const cleanUpResources = () => {
            if (downloadTimeout) {
                clearTimeout(downloadTimeout);
                downloadTimeout = null;
            }
            if (ytdlp && !ytdlp.killed) {
                ytdlp.kill("SIGKILL");
            }
        };

        // Process timeout protection (2 minutes)
        downloadTimeout = setTimeout(() => {
            if (!isSettled) {
                isSettled = true;
                cleanUpResources();
                reject(new Error("DOWNLOAD_METADATA_TIMEOUT"));
            }
        }, 120000);

        let stdoutData = "";
        let stderrData = "";

        ytdlp.stdout.on("data", (data) => { stdoutData += data.toString(); });
        ytdlp.stderr.on("data", (data) => { stderrData += data.toString(); });

        ytdlp.on("close", (code) => {
            if (isSettled) return;
            isSettled = true;

            // Clean up immediately when the process exits
            cleanUpResources();

            if (code !== 0) {
                reject(new Error(`yt-dlp runtime extraction failed with exit code ${code}: ${stderrData}`));
                return;
            }

            try {
                const metadata = JSON.parse(stdoutData);
                const rawFormats = metadata.formats || [];

                // Core Profile Details Mapping
                const channelName = metadata.channel || metadata.uploader || "Unknown Channel";
                const singleThumbnail = metadata.thumbnail || (metadata.thumbnails?.length ? metadata.thumbnails[metadata.thumbnails.length - 1].url : "");

                // Locate Best Audio Stream Definition
                const audioOnlyFormats = rawFormats.filter(f => f.vcodec === "none" && f.acodec !== "none");
                let bestAudio = null;

                if (audioOnlyFormats.length > 0) {
                    audioOnlyFormats.sort((a, b) => {
                        const bytesB = b.filesize || b.filesize_approx || 0;
                        const bytesA = a.filesize || a.filesize_approx || 0;
                        return bytesB - bytesA;
                    });

                    const topAudio = audioOnlyFormats[0];
                    bestAudio = {
                        formatId: topAudio.format_id,
                        ext: topAudio.ext,
                        acodec: topAudio.acodec,
                        sizeMB: calculateMegabytes(topAudio)
                    };
                }

                // Loop Target Resolution Enforcements
                const targetHeights = [360, 480, 720, 1080];
                const cleanQualities = [];

                targetHeights.forEach(height => {
                    const matches = rawFormats.filter(f => f.height === height && f.vcodec !== "none");

                    if (matches.length > 0) {
                        // Prioritize mp4 files, fallback to matching by weight
                        matches.sort((a, b) => {
                            if (a.ext === "mp4" && b.ext !== "mp4") return -1;
                            if (b.ext === "mp4" && a.ext !== "mp4") return 1;
                            return (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0);
                        });

                        const bestMatch = matches[0];
                        let totalSizeMB = calculateMegabytes(bestMatch);

                        if (bestMatch.acodec === "none" && bestAudio) {
                            const videoBytes = parseFloat(totalSizeMB) || 0;
                            const audioBytes = parseFloat(bestAudio.sizeMB) || 0;
                            totalSizeMB = (videoBytes + audioBytes).toFixed(2);
                        }

                        cleanQualities.push({
                            label: `${height}p`,
                            formatId: bestMatch.format_id,
                            resolution: bestMatch.resolution || `${bestMatch.width}x${bestMatch.height}`,
                            ext: bestMatch.ext,
                            fps: bestMatch.fps,
                            vcodec: bestMatch.vcodec,
                            acodec: bestMatch.acodec,
                            sizeMB: totalSizeMB
                        });
                    }
                });

                // Dispatch Payload Interface
                resolve({
                    title: metadata.title,
                    channel: channelName,
                    thumbnail: singleThumbnail,
                    duration: metadata.duration,
                    view_count: metadata.view_count,
                    uploadedAt: metadata.timestamp,
                    comment_count: metadata.comment_count,
                    bestAudio,
                    videoQualities: cleanQualities,
                    videoId: metadata.id,
                    extractor: metadata.extractor
                });

            } catch (err) {
                logger.error(`❌ Failed to parse video metadata JSON: ${err}`);
                reject(err);
            }
        });
    });
};