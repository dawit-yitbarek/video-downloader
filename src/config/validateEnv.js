import logger from '../utils/logger.js';
import { REQUIRED_ENV_KEYS } from './env.js';

export function validateEnvironment() {
    const missing = REQUIRED_ENV_KEYS.filter(key => !process.env[key]);

    if (missing.length > 0) {
        logger.error('❌ [System Config] Missing required environment configurations:');
        missing.forEach(key => logger.error(`   - ${key}`));
        logger.error('\n📋 Update fields inside your local .env configuration framework.\n');
        process.exit(1);
    }

    logger.info('✅ Environment variable assertions completed successfully');
    return true;
}