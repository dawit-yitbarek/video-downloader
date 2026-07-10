import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";

// separation between files
const infoOnly = format((info) => info.level === "info" ? info : false)();
const warnOnly = format((info) => info.level === "warn" ? info : false)();

const logger = createLogger({
    level: "info",
    format: format.combine(
        format.timestamp({
            format: () => new Date().toLocaleString("en-US", {
                timeZone: "Africa/Nairobi",
                hour12: true
            })
        }),
        format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
    ),
    transports: [
        // Info and general logs
        new transports.DailyRotateFile({
            filename: "logs/app-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "14d",
            format: infoOnly
        }),

        // Error logs ONLY
        new transports.DailyRotateFile({
            filename: "logs/error-%DATE%.log",
            level: "error",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "30d"
        }),

        // Warning logs ONLY
        new transports.DailyRotateFile({
            filename: "logs/warn-%DATE%.log",
            level: "warn",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: "20m",
            maxFiles: "30d",
            format: warnOnly
        }),

        // Console output for everything
        new transports.Console()
    ]
});

export default logger;