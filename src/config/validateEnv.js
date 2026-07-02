import { envVariablesArray } from './env.js';

export function validateEnvironment() {
    const missing = envVariablesArray.filter(varName => !varName);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(varName => console.error(`   - ${varName}`));
        console.error('\n📋 Please set all required variables in your .env file');
        process.exit(1);
    }

    console.log('✅ All required environment variables are set');
    return true;
}
