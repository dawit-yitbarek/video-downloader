import type { PlatformType } from "../types/index.js";

const patterns: Partial<Record<PlatformType, { regex: RegExp }>> = {
    youtube: { regex: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i },
    youtube_short: { regex: /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[\?&/].*)?$/i },
    tiktok: { regex: /tiktok\.com\/@[\w.-]+\/video\/(\d+)/i },
    tiktok_photo: { regex: /tiktok\.com\/@[\w.-]+\/photos?\/(\d+)/i, },
    instagram: { regex: /instagram\.com\/(?:p|reel|reels|tv|stories\/[\w.-]+)\/([a-zA-Z0-9_-]+)/i },
    instagram_story: { regex: /instagram\.com\/stories\/[\w.-]+\/(\d+)/i, },
    instagram_post: { regex: /instagram\.com\/(?:p)\/([a-zA-Z0-9_-]+)/i, },
    twitter: { regex: /(?:twitter|x)\.com\/(?:[\w]+)\/status\/(\d+)/i },
    facebook: { regex: /facebook\.com\/(?:watch\/?\?v=|reel\/|videos\/|[\w.]+\/videos\/|live\/)(\d+)/i },
    pinterest: { regex: /pinterest\.(?:com|[\w]{2,3})\/pin\/(\d+)/i },
    snapchat: { regex: /snapchat\.com\/(?:@[\w.-]+\/)?(?:spotlight|p)\/([a-zA-Z0-9_~-]+)/i },
    linkedin: { regex: /linkedin\.com\/(?:posts\/[\w-]+-(\d+)|feed\/update\/urn:li:activity:(\d+)|embed\/feed\/update\/urn:li:ugcPost:(\d+))/i, }
}

export function extractMediaId({ url, platform }: { url: string; platform: PlatformType }): string | null {
    const selectedPlatform = patterns[platform];
    if (!selectedPlatform) return null;

    const match = url.match(selectedPlatform.regex);

    return match?.slice(1).find(Boolean) ?? null;
}