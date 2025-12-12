export const logError = (prefix, message) => {
    console.error(`[ERROR] ${prefix}: ${message}`);
};

export const logSuccess = (prefix, message) => {
    console.log(`[SUCCESS] ${prefix}: ${message}`);
};