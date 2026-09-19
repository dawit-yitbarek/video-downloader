import type { PlatformType } from "../types/index.js";

// Identifies the social media platform and content format from a given URL
export function identifyPlatformType(url: string): PlatformType {
    if (!url || typeof url !== 'string') {
        return 'other';
    }

    const cleanUrl = url.trim().toLowerCase();

    // YouTube Shorts check
    if (
        cleanUrl.includes('youtube.com/shorts/') ||
        cleanUrl.includes('youtu.be/shorts/')
    ) {
        return 'youtube_short';
    }

    // Standard YouTube
    if (
        cleanUrl.includes('youtube.com') ||
        cleanUrl.includes('youtu.be')
    ) {
        return 'youtube';
    }

    // TikTok Photo / Slideshow check
    if (
        (cleanUrl.includes('tiktok.com') || cleanUrl.includes('vm.tiktok.com') || cleanUrl.includes('vt.tiktok.com')) &&
        (cleanUrl.includes('/photo/') || cleanUrl.includes('/photos/'))
    ) {
        return 'tiktok_photo';
    }

    // TikTok
    if (
        cleanUrl.includes('tiktok.com') ||
        cleanUrl.includes('vm.tiktok.com') ||
        cleanUrl.includes('vt.tiktok.com')
    ) {
        return 'tiktok';
    }

    // Instagram Story
    if (
        (cleanUrl.includes('instagram.com') || cleanUrl.includes('instagr.am')) &&
        (cleanUrl.includes('/stories/') || cleanUrl.includes('/s/'))
    ) {
        return 'instagram_story';
    }

    // Instagram Post
    if (
        (cleanUrl.includes('instagram.com') || cleanUrl.includes('instagr.am')) &&
        cleanUrl.includes('/p/')
    ) {
        return 'instagram_post';
    }

    // Instagram
    if (
        cleanUrl.includes('instagram.com') ||
        cleanUrl.includes('instagr.am')
    ) {
        return 'instagram';
    }

    // Twitter / X
    if (
        cleanUrl.includes('twitter.com') ||
        cleanUrl.includes('x.com')
    ) {
        return 'twitter';
    }

    // Snapchat
    if (
        cleanUrl.includes('snapchat.com') ||
        cleanUrl.includes('story.snapchat.com')
    ) {
        return 'snapchat';
    }

    // LinkedIn
    if (
        cleanUrl.includes('linkedin.com') ||
        cleanUrl.includes('lnkd.in')
    ) {
        return 'linkedin';
    }

    // Facebook
    if (
        cleanUrl.includes('facebook.com') ||
        cleanUrl.includes('fb.watch') ||
        cleanUrl.includes('fb.com') ||
        cleanUrl.includes('m.facebook.com')
    ) {
        return 'facebook';
    }

    // Pinterest
    if (
        cleanUrl.includes('pinterest.com') ||
        cleanUrl.includes('pin.it')
    ) {
        return 'pinterest';
    }

    return 'other';
}