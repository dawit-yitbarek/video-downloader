import cron from "node-cron";
import { refreshCookies } from "../utils/cookieRefresher.js";
import path from "path";
const ytCookiePath = path.resolve("./src/bin/youtube-cookies.txt");
const igCookiePath = path.resolve("./src/bin/instagram-cookies.txt");
const ytProfileDir = path.resolve("./puppeteer-profiles/puppeteer-profile-youtube");
const igProfileDir = path.resolve("./puppeteer-profiles/puppeteer-profile-instagram");


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, { attempts = 3, delayMs = 60_000, label = "task", } = {}) {
    let lastError;

    for (let i = 1; i <= attempts; i++) {
        try {
            console.log(`[retry] ${label}: attempt ${i}/${attempts}`);
            return await fn();
        } catch (err) {
            lastError = err;
            console.error(`[retry] ${label} failed (attempt ${i})`, err.message);

            if (i < attempts) {
                console.log(`[retry] waiting ${delayMs / 1000 / 60}m before retry...`);
                await sleep(delayMs);
            }
        }
    }

    throw lastError;
}

const CRON_OPTIONS = {
    timezone: "Africa/Addis_Ababa",
};


cron.schedule(
    "0 0 * * SUN",
    async () => {
        try {
            await retry(() => refreshCookies(ytProfileDir, "https://youtube.com", ytCookiePath),
                { attempts: 3, delayMs: 5 * 60_000, label: "YouTube cookie refresh", }
            );

            console.log("[cron] ✅ YouTube cookies refreshed");
        } catch (err) {
            console.error(
                "[cron] ❌ YouTube cookie refresh failed after retries",
                err.message
            );
        }
    },
    CRON_OPTIONS
);

cron.schedule(
    "10 0 * * SUN",
    async () => {
        try {
            await retry(() => refreshCookies(igProfileDir, "https://instagram.com", igCookiePath),
                { attempts: 3, delayMs: 5 * 60_000, label: "Instagram cookie refresh", });

            console.log("[cron] ✅ Instagram cookies refreshed");
        } catch (err) {
            console.error(
                "[cron] ❌ Instagram cookie refresh failed after retries",
                err.message
            );
        }
    },
    CRON_OPTIONS
);


export const paths = {
    ytCookiePath,
    igCookiePath,
    ytProfileDir,
    igProfileDir,
};