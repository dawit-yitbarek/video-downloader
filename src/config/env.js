import dotenv from 'dotenv';

dotenv.config();

export const {
    NODE_ENV,
    PORT,
    BACKEND_URL,
    BOT_TOKEN,
    BOT_USERNAME,
    YTDLP_COOKIES,
    REDIS_URL,
    CHANNEL_ID,
    LOCAL_TELEGRAM_API_SERVER,
} = process.env;

// Automatically group the actual variables into an array to loop over elsewhere
export const REQUIRED_ENV_KEYS = [
    'NODE_ENV',
    'PORT',
    'BACKEND_URL',
    'BOT_TOKEN',
    'BOT_USERNAME',
    'YTDLP_COOKIES',
    'REDIS_URL',
    'CHANNEL_ID',
    'LOCAL_TELEGRAM_API_SERVER'
];