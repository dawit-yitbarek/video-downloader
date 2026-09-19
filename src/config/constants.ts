import path from "node:path";
import type { PlatformType } from "../types/index.js";

const DOWNLOAD_LIMIT = 10
const WINDOW_SECONDS = 60 * 60 * 24;
const COOKIE_PATH = path.resolve(import.meta.dirname, "../bin/cookies.txt");
const USER_BOT_REQUEST_TIMEOUT = 3 * 60 * 1000;
const userBotPlatforms: PlatformType[] = ["tiktok", "instagram", "youtube", "youtube_short"];
const galleryDlPlatforms: PlatformType[] = ["tiktok_photo", "pinterest", "instagram_story", "instagram_post"];
const cookieNeededPlatforms: PlatformType[] = ['youtube', 'youtube_short', 'instagram_story', 'instagram_post', 'instagram'];


const targetBotErrorKeywords = [
    // English Short Keywords 
    "error", "incorrect", "invalid", "unavailable", "could not", "can't", "couldn't",
    "failed", "unable", "private", "restricted", "login", "try again", "later",

    // Russian Short Keywords
    "ошибка", "неверный", "неправильный", "не удалось", "не могу", "не получилось",
    "невозможно", "сбой", "приватный", "ограничен", "авторизация", "позже",

    // Uzbek Short Keywords
    "xato", "noto'g'ri", "iloji bo'lmadi", "imkonsiz", "muvaffaqiyatsiz",
    "yuklab bo'lmadi", "shaxsiy", "yopiq", "cheklangan", "keyinroq", "qayta"
];

const TARGET_BOT_ERROR_REGEX = new RegExp(targetBotErrorKeywords.join("|"), "i");

const TARGET_BOTS: { name: string, username: string, id: number, canHandle: PlatformType[] }[] = [
    { name: "Save OFF", username: "SaveOFFbot", id: 1825028508, canHandle: ["tiktok"] },
    { name: "Save As Bot", username: "SaveAsBot", id: 523131145, canHandle: ["tiktok", "instagram"] },
    { name: "Tik Go", username: "TikGoBot", id: 5856278549, canHandle: ["tiktok", "instagram"] },
    { name: "HK tiktok", username: "HK_tiktok_BOT", id: 801042975, canHandle: ["tiktok", "instagram", "youtube_short"] },
    { name: "All saver", username: "allsaverbot", id: 804576054, canHandle: ["tiktok", "instagram", "youtube", "youtube_short"] },
    { name: "Vide", username: "youtube_instagram_videobot", id: 8377404549, canHandle: ["tiktok", "instagram", "youtube", "youtube_short"] },
    { name: "Video Saved", username: "VideoSavedBot", id: 5420580312, canHandle: ["tiktok", "instagram", "youtube", "youtube_short"] },
]

export {
    DOWNLOAD_LIMIT,
    WINDOW_SECONDS,
    COOKIE_PATH,
    USER_BOT_REQUEST_TIMEOUT,
    TARGET_BOT_ERROR_REGEX,
    TARGET_BOTS,
    userBotPlatforms,
    galleryDlPlatforms,
    cookieNeededPlatforms
};