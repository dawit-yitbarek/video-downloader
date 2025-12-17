import { spawn } from "child_process";

export function getRcloneFileSize(remotePath) {
    return new Promise((resolve, reject) => {
        // 'rclone size --json' to get machine-readable output
        const sizeProcess = spawn('rclone', ['size', remotePath, '--json']);
        let jsonOutput = '';

        sizeProcess.stdout.on('data', (data) => {
            jsonOutput += data.toString();
        });

        sizeProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const sizeData = JSON.parse(jsonOutput);
                    resolve(sizeData.bytes);
                } catch (e) {
                    reject(new Error("Failed to parse rclone size JSON output."));
                }
            } else {
                reject(new Error(`rclone size failed with code ${code}`));
            }
        });
        sizeProcess.on('error', (err) => reject(err));
    });
}