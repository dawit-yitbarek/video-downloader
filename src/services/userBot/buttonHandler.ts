import { Api } from "telegram";
import type { label } from "../../types/index.js";

const UK_FLAG = "🇬🇧";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handleButtonClick = async (message: Api.Message, label: label) => {
    if (!message.buttons) return;
    const targetLabel = label.toLowerCase();
    const videoSavedBotButtonText = label === "audio" ? "download audio" : "download video";
    const SaveOFFbotAdButton = "Link if it doesn't work".toLowerCase()

    for (const [i, row] of message.buttons.entries()) {
        if (!row) continue;
        for (const [j, button] of row.entries()) {
            if (!button) continue;
            const text = button.text.toLowerCase();

            if (
                text.includes(targetLabel) ||
                text.includes(videoSavedBotButtonText) ||
                text.includes(UK_FLAG) ||
                text.includes(SaveOFFbotAdButton)
            ) {
                console.log(`🎯 Target button clicked: "${button.text}" at [${i}, ${j}]`);
                const success = await executeClick(message, i, j);
                if (success) return;
            }
        }
    }
};

async function executeClick(message: Api.Message, rowIndex: number, colIndex: number): Promise<boolean> {
    try {
        await sleep(1200);
        let res: any = await message.click({ i: rowIndex, j: colIndex });
        let resText = typeof res === "string" ? res : res?.message;

        if (resText && /kuting|wait|sekund|second/i.test(resText)) {
            await sleep(1500);
            res = await message.click({ i: rowIndex, j: colIndex });
        }
        return true;
    } catch (error: any) {
        console.error(`[user-bot] failed to click Callback button ${error?.message || error}`);
        return false;
    }
}