import { spawn } from "child_process";

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