import dotenv from 'dotenv';

dotenv.config();

export const { NODE_ENV, PORT, BACKEND_URL, FRONTEND_URL, TELEGRAM_BOT_TOKEN, YTDLP_COOKIES, REDIS_URL, CHANNEL_ID } = process.env;