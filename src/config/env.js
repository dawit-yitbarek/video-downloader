import dotenv from 'dotenv';

dotenv.config();

export const {
    NODE_ENV,
    PORT,
    BACKEND_URL,
    TELEGRAM_BOT_TOKEN,
    YTDLP_COOKIES,
    REDIS_URL,
    CHANNEL_ID,
    B2_KEY_ID,
    B2_APP_KEY,
    B2_BUCKET_NAME,
    B2_BUCKET_ID
} = process.env;