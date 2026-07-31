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
    RUNNING_IN_DOCKER = 'false', // Default to 'false', set to 'true' when starting the app using docker-compose.yml file
} = process.env;

export const isDocker = RUNNING_IN_DOCKER.toLowerCase() === 'true';

// Base required keys for all environments
const baseRequiredKeys = [
    'NODE_ENV',
    'BOT_TOKEN',
    'BOT_USERNAME',
    'YTDLP_COOKIES',
    'CHANNEL_ID'
];

// Variables that are ONLY required when running outside Docker Compose
const hostOnlyRequiredKeys = [
    'PORT',
    'REDIS_URL',
    'LOCAL_TELEGRAM_API_SERVER'
];

// Dynamically add REDIS_URL only if Redis is enabled
export const REQUIRED_ENV_KEYS = isDocker ? baseRequiredKeys
    : [...baseRequiredKeys, ...hostOnlyRequiredKeys];