import dotenv from 'dotenv';

dotenv.config();

export const {
    NODE_ENV,
    PORT,
    BOT_TOKEN,
    BOT_USERNAME,
    YTDLP_COOKIES,
    REDIS_URL,
    CHANNEL_ID,
    LOCAL_TELEGRAM_API_SERVER,
    USE_REDIS = 'true', // Default to 'true', set to 'false' on env if running without Redis
} = process.env;

// Base required keys for all environments
const baseRequiredKeys = [
    'NODE_ENV',
    'PORT',
    'BOT_TOKEN',
    'BOT_USERNAME',
    'YTDLP_COOKIES',
    'CHANNEL_ID',
    'LOCAL_TELEGRAM_API_SERVER'
];

// Dynamically add REDIS_URL only if Redis is enabled
export const REQUIRED_ENV_KEYS = USE_REDIS === 'true'
    ? [...baseRequiredKeys, 'REDIS_URL']
    : baseRequiredKeys;