import { notifyAdminError } from "./logger.js";


// Helper to safely parse Retry-After headers in both Seconds or HTTP-Date formats
function getRetryAfterDelayMs(headerValue: string | null, maxWaitMs = 10000): number {
    if (!headerValue) return 2000; // Default fallback: 2s

    // 1. Try parsing as integer seconds
    const seconds = parseInt(headerValue, 10);
    if (!isNaN(seconds)) {
        return Math.min(Math.max(seconds * 1000, 1000), maxWaitMs);
    }

    // 2. Try parsing as HTTP-Date string
    const dateMs = Date.parse(headerValue);
    if (!isNaN(dateMs)) {
        const diffMs = dateMs - Date.now();
        return Math.min(Math.max(diffMs, 1000), maxWaitMs);
    }

    return 2000;
}


// Helper to implement abort timeout for fetch requests
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 5000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } finally {
        clearTimeout(id);
    }
};

// Browser-like default headers to pass bot detection checks
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
};

export async function resolveFullUrl(shortUrl: string): Promise<string> {
    if (!shortUrl || typeof shortUrl !== 'string') {
        return shortUrl;
    }

    const cleanUrl = shortUrl.trim();

    // 1. First attempt: Fast HEAD request following redirects
    try {
        const headResponse = await fetchWithTimeout(cleanUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: BROWSER_HEADERS,
        }, 4000);

        if (headResponse.url && headResponse.url !== cleanUrl) {
            return headResponse.url;
        }
    } catch {
        // Fallback to GET on HEAD failure or timeout
    }

    // 2. Second attempt: Manual GET redirect loop
    try {
        let currentUrl = cleanUrl;
        let redirectCount = 0;
        let rateLimitRetries = 0;
        const maxRedirects = 5;
        const maxRateLimitRetries = 3;

        while (redirectCount < maxRedirects) {
            const response = await fetchWithTimeout(currentUrl, {
                method: 'GET',
                redirect: 'manual',
                headers: BROWSER_HEADERS,
            }, 5000);

            if (response.status === 429) {
                rateLimitRetries++;
                if (rateLimitRetries > maxRateLimitRetries) {
                    return currentUrl;
                }

                const delayMs = getRetryAfterDelayMs(response.headers.get('retry-after'), 10000);

                await new Promise((res) => setTimeout(res, delayMs));
                continue;
            }

            const location = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && location) {
                currentUrl = new URL(location, currentUrl).toString();
                redirectCount++;
            } else {
                return response.url || currentUrl;
            }
        }

        return currentUrl;
    } catch (error: any) {
        console.error(`[UrlResolver] Failed to resolve short URL (${cleanUrl}): ${error.message || error}`);
        notifyAdminError(error, `resolveFullUrl: ${cleanUrl}`);
        return cleanUrl;
    }
}