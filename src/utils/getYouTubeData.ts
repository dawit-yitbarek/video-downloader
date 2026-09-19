import { notifyAdminError } from "./logger.js";

export async function getYouTubeData(url: string): Promise<{ title: string, thumbnail: Buffer<ArrayBuffer> } | null> {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);

        if (!response.ok) {
            return null;
        }

        const data: { title: string; thumbnail_url: string } = await response.json();

        if (data.thumbnail_url) {
            const thumbnail = await fetch(data.thumbnail_url);
            const arrayBuffer = await thumbnail.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return { title: data.title, thumbnail: buffer }
        }

        return null;
    } catch (error: any) {
        console.error(`[Youtube Data] Failed to fetch youtube thumbail and title: ${error.message || error}`);
        notifyAdminError(error, 'getYouTubeData');
        return null;
    }
}