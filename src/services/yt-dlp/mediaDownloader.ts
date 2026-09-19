import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { COOKIE_PATH, cookieNeededPlatforms } from '../../config/constants.js';
import type { label } from '../../types/index.js';
import { getMediaDuration } from '../../utils/getMediaDuration.js';
import { identifyPlatformType } from '../../utils/platformTypeDetector.js';

const execFileAsync = promisify(execFile);

const BROWSER_PROFILES = ['chrome', 'firefox', 'edge',];

let currentProfileIndex = 0;

export const ytdlpDownloadMedia = async ({ url, label, outputDir }: { url: string; label: label, outputDir: string }) => {
    try {
        // 1. Pick a fresh browser profile per execution
        const profile = BROWSER_PROFILES[currentProfileIndex]!;
        currentProfileIndex = (currentProfileIndex + 1) % BROWSER_PROFILES.length;

        const platform = identifyPlatformType(url);
        const isAudio = label === 'audio';
        const tempFilename = `${Date.now()}_${label}`;

        let formatArgument: string;
        let expectedExt: string;
        const extraArgs: string[] = [];

        if (isAudio) {
            formatArgument = 'bestaudio/best';
            expectedExt = 'm4a';
            extraArgs.push('-x', '--audio-format', 'm4a');
        } else {
            const height = label.replace('p', '');
            formatArgument = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
            expectedExt = 'mp4';
            extraArgs.push(
                '--merge-output-format', expectedExt,
                '-S', `+res:${height}`
            );
        }

        if (cookieNeededPlatforms.includes(platform)) {
            extraArgs.push('--cookies', COOKIE_PATH);
        } else {
            extraArgs.push('--impersonate', profile);
        }

        const expectedFilePath = path.join(outputDir, `${tempFilename}.${expectedExt}`);
        const expectedThumbPath = path.join(outputDir, `${tempFilename}.jpg`);

        const ytdlpArgs = [
            '-f', formatArgument,
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            '--js-runtimes', 'node',
            '--remote-components', 'ejs:github',
            '--postprocessor-args', 'ffmpeg:-movflags +faststart',
            ...extraArgs,
            '-o', expectedFilePath,
            url,
        ];

        await execFileAsync('yt-dlp', ytdlpArgs, { timeout: 300_000 });

        const duration = await getMediaDuration(expectedFilePath);
        const thumbnailPath = fs.existsSync(expectedThumbPath) ? expectedThumbPath : undefined;

        return {
            filePath: expectedFilePath,
            duration,
            thumbnailPath,
        };
    } catch (error: any) {
        if (error.killed && error.signal === 'SIGTERM') {
            throw new Error('[yt-dlp Error]: DOWNLOAD_TIMEOUT');
        }
        throw new Error(`[yt-dlp Error]: ${error.message || error}`);
    }
};