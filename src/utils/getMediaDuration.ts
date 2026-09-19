import { execFile } from 'child_process';
import { promisify } from 'util';
import { notifyAdminError } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export async function getMediaDuration(filePath: string): Promise<number | undefined> {
    try {
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);

        return parseFloat(stdout.trim());
    } catch (error: any) {
        console.error(`[Duration Extractor] Failed to get media duration: ${error.message || error}`)
        notifyAdminError(error, 'getMediaDuration');
    }
}