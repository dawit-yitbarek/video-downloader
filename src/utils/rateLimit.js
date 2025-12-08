import fs from "fs";
import fsPromises from "fs/promises";
import { RATE_LIMIT_FILE, DAILY_LIMIT } from "../config/constants.js";

if (!fs.existsSync(RATE_LIMIT_FILE)) fs.writeFileSync(RATE_LIMIT_FILE, "{}");

export const loadRateLimits = async () => {
    try {
        const raw = await fsPromises.readFile(RATE_LIMIT_FILE, "utf8");
        return JSON.parse(raw || "{}");
    } catch {
        return {};
    }
};

export const saveRateLimits = async (data) => {
    const tmp = `${RATE_LIMIT_FILE}.tmp`;
    await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fsPromises.rename(tmp, RATE_LIMIT_FILE);
};

export const checkUserLimit = async (uid) => {
    const data = await loadRateLimits();
    const today = new Date().toISOString().slice(0, 10);
    if (!data[uid] || data[uid].date !== today) {
        data[uid] = { date: today, count: 0 };
        await saveRateLimits(data);
    }
    return (data[uid].count || 0) < DAILY_LIMIT;
};

export const incrementUserLimit = async (uid) => {
    const data = await loadRateLimits();
    const today = new Date().toISOString().slice(0, 10);
    if (!data[uid] || data[uid].date !== today) data[uid] = { date: today, count: 0 };
    data[uid].count++;
    await saveRateLimits(data);
};