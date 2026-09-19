import mime from 'mime-types'
import { promisify } from 'util';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { COOKIE_PATH, cookieNeededPlatforms } from '../../config/constants.js';
import { identifyPlatformType } from '../../utils/platformTypeDetector.js';
import { type MediaGroupItem } from '../redis.service.js';

const execFileAsync = promisify(execFile);

export const galleryDlDownloadMedia = async ({ url, outputDir }: { url: string, outputDir: string }) => {
    try {
        const platform = identifyPlatformType(url);

        const extraArgs: string[] = [];

        // 2. Cookie Management
        if (cookieNeededPlatforms.includes(platform)) {
            extraArgs.push('--cookies', COOKIE_PATH);
        }

        const gallerydlArgs = [
            '--directory', outputDir,
            '--filename', '{category}_{id}_{num}.{extension}',
            '--retries', '3',
            ...extraArgs,
            url,
        ];

        await execFileAsync('gallery-dl', gallerydlArgs, { timeout: 300_000 });


        const downloadedItems: MediaGroupItem[] = fs.readdirSync(outputDir)
            .map(file => path.join(outputDir, file))
            .filter(filePath => fs.statSync(filePath).isFile())
            .flatMap(filePath => {
                const mimeType = mime.lookup(filePath);

                if (mimeType && mimeType.startsWith('image/')) {
                    return [{ fileSource: filePath, type: 'photo' } as MediaGroupItem];
                }
                if (mimeType && mimeType.startsWith('video/')) {
                    return [{ fileSource: filePath, type: 'video' } as MediaGroupItem];
                }
                return [];
            });

        if (downloadedItems.length === 0) {
            throw new Error('No media files were captured by gallery-dl.');
        }

        return {
            files: downloadedItems,
        };

    } catch (error: any) {
        if (error.killed && error.signal === 'SIGTERM') {
            throw new Error('[gallery-dl Error]: DOWNLOAD_TIMEOUT');
        }
        throw new Error(`[gallery-dl Error]: ${error.message || error}`);
    }
};
