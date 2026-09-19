import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    CHANNEL_ID: z.string(),
    INCLUDE_USERBOT: z.string().default('false').transform((val) => val.toLowerCase() === 'true'),
    UNLIMITED_USERS: z
        .string()
        .optional()
        .transform((val) =>
            val ? val.split(',').map((id) => Number(id.trim())).filter((n) => !isNaN(n)) : []
        ),
    YTDLP_COOKIES: z.string().optional(),
    LOCAL_TELEGRAM_API_SERVER: z.string(),
    TELEGRAM_SESSION_STRING: z.string().optional(),
    TELEGRAM_API_ID: z.coerce.number(),
    TELEGRAM_API_HASH: z.string(),
    PRIVATE_GROUP_ID: z.coerce.number().optional(),
    ADMIN_CHAT_ID: z.coerce.number().optional(),
    DOWNLOAD_PATH: z.string(),
}).superRefine((data, ctx) => {
    if (data.INCLUDE_USERBOT) {
        if (!data.TELEGRAM_SESSION_STRING) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'TELEGRAM_SESSION_STRING is required when INCLUDE_USERBOT is true',
                path: ['TELEGRAM_SESSION_STRING'],
            });
        }
        if (data.PRIVATE_GROUP_ID === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'PRIVATE_GROUP_ID is required when UNCLUDE_USERBOT is true',
                path: ['PRIVATE_GROUP_ID'],
            });
        }
    }
});

const parseEnv = () => {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(JSON.stringify(result.error.format(), null, 2));
        process.exit(1);
    }

    return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;