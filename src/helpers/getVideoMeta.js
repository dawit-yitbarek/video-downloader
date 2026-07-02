import { spawn } from "child_process";

export const getVideoMetaData = (videoUrl, cookiePath) => {
    return new Promise((resolve, reject) => {
        const ytdlp = spawn("yt-dlp", [
            "--dump-json",
            "--cookies", cookiePath,
            "--js-runtimes", "node",
            "--remote-components", "ejs:github",
            videoUrl
        ]);

        let stdoutData = "";
        let stderrData = "";

        ytdlp.stdout.on("data", (data) => {
            stdoutData += data.toString();
        });

        ytdlp.stderr.on("data", (data) => {
            stderrData += data.toString();
        });

        ytdlp.on("close", (code) => {
            if (code !== 0) {
                console.error(`Error: ${stderrData}`);
                reject(new Error(`yt-dlp failed with code ${code}: ${stderrData}`));
                return;
            }

            try {
                const metadata = JSON.parse(stdoutData);

                // Array that holds different formats of the video
                const rawFormats = metadata.formats || [];

                // Get channel and basic details
                const channelName = metadata.channel || metadata.uploader || "Unknown Channel";
                const singleThumbnail = metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails.length ? metadata.thumbnails[metadata.thumbnails.length - 1].url : "");

                // Identify the absolute best audio track (highest quality audio-only format)
                const audioOnlyFormats = rawFormats.filter(f => f.vcodec === "none" && f.acodec !== "none");
                let bestAudio = null;

                if (audioOnlyFormats.length > 0) {
                    // Sort descending by filesize, fallback to quality/abr if size is missing
                    audioOnlyFormats.sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0));
                    const topAudio = audioOnlyFormats[0];

                    bestAudio = {
                        formatId: topAudio.format_id,
                        ext: topAudio.ext,
                        acodec: topAudio.acodec,
                        sizeMB: topAudio.filesize ? (topAudio.filesize / (1024 * 1024)).toFixed(2) : (topAudio.filesize_approx ? (topAudio.filesize_approx / (1024 * 1024)).toFixed(2) : "Unknown")
                    };
                }

                // 3. Filter major video-only and combined video qualities
                const targetHeights = [360, 480, 720, 1080];
                const cleanQualities = [];

                targetHeights.forEach(height => {
                    // Find all tracks matching this exact height metric
                    const matches = rawFormats.filter(f => f.height === height && f.vcodec !== "none");

                    if (matches.length > 0) {
                        // Prefer mp4 extension when available, otherwise pick the largest file size variation
                        matches.sort((a, b) => {
                            if (a.ext === "mp4" && b.ext !== "mp4") return -1;
                            if (b.ext === "mp4" && a.ext !== "mp4") return 1;
                            return (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0);
                        });

                        const bestMatch = matches[0];
                        cleanQualities.push({
                            label: `${height}p`,
                            formatId: bestMatch.format_id,
                            resolution: bestMatch.resolution || `${bestMatch.width}x${bestMatch.height}`,
                            ext: bestMatch.ext,
                            fps: bestMatch.fps,
                            vcodec: bestMatch.vcodec,
                            acodec: bestMatch.acodec,
                            sizeMB: bestMatch.filesize ? (bestMatch.filesize / (1024 * 1024)).toFixed(2) : (bestMatch.filesize_approx ? (bestMatch.filesize_approx / (1024 * 1024)).toFixed(2) : "Unknown")
                        });
                    }
                });

                // 4. Construct the clean JSON payload
                const cleanJsonOutput = {
                    title: metadata.title,
                    channel: channelName,
                    thumbnail: singleThumbnail,
                    duration: metadata.duration,
                    view_count: metadata.view_count,
                    uploadedAt: metadata.timestamp,
                    comment_count: metadata.comment_count,
                    bestAudio: bestAudio,
                    videoQualities: cleanQualities
                };

                resolve(cleanJsonOutput);

            } catch (err) {
                console.error("Failed to parse JSON:", err);
                reject(err);
            } finally {
                if (ytdlp && !ytdlp.killed) {
                    ytdlp.kill("SIGKILL");
                }
            }
        });
    });
};



export function getVideoMeta(videoUrl, cookiePath) {
    return new Promise((resolve, reject) => {
        const args = [
            "-J",
            "--no-playlist",
            "--cookies", cookiePath,
            "--js-runtimes", "node",
            "--remote-components", "ejs:github",
            videoUrl
        ];

        const ytdlp = spawn("yt-dlp", args);

        let output = "";
        let error = "";

        ytdlp.stdout.on("data", d => output += d.toString());
        ytdlp.stderr.on("data", d => error += d.toString());
        const cleanup = () => {
            ytdlp.kill("SIGKILL");
        };

        // Timeout after 30 seconds
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("yt-dlp metadata timeout after 30 seconds"));
        }, 30000);

        ytdlp.on("close", code => {
            clearTimeout(timeout);
            if (code !== 0) {
                cleanup();
                return reject(new Error(error || "yt-dlp metadata failed"));
            }

            try {
                const json = JSON.parse(output);

                const size =
                    json.filesize ||
                    json.filesize_approx ||
                    json.requested_formats?.[0]?.filesize ||
                    json.requested_formats?.[0]?.filesize_approx ||
                    null;

                if (!size) {
                    console.log("⚠️ Video size unavailable, proceeding without size check");
                    return resolve(null);
                }

                console.log(`📏 Video size detected: ${(size / 1024 / 1024).toFixed(1)} MB`);
                resolve(size);

            } catch (err) {
                cleanup();
                reject(err);
            }
        });
    });
}