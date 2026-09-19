# Telegram Video Downloader Bot

A Telegram video downloader bot built with TypeScript and grammY. It uses yt-dlp and gallery-dl to retrieve media, with Redis and BullMQ for queued background processing.

## Key Features

- Download media from supported social platforms
- YouTube quality and audio selection
- yt-dlp and gallery-dl downloader backends
- Redis-backed caching and rate limiting
- BullMQ background download queue
- Optional Telegram user-bot integration
- Docker Compose deployment with local Telegram Bot API support

## Tech Stack

- TypeScript and Node.js
- grammY
- Redis and BullMQ
- Docker and Docker Compose
- yt-dlp
- gallery-dl
- FFmpeg

## Prerequisites

For local development, install:

- Node.js 22 or later
- npm
- Redis
- FFmpeg, yt-dlp, and gallery-dl available on `PATH`
- A Telegram bot token from BotFather

The optional user-bot integration also requires Telegram API credentials and a session string.

## Quick Start / Local Setup

```bash
git clone <repository-url>
cd Video-downloader
npm install
```

Create a `.env` file with values for the required configuration:

```env
BOT_TOKEN=<telegram-bot-token>
REDIS_URL=redis://localhost:6379
CHANNEL_ID=<required-channel>
LOCAL_TELEGRAM_API_SERVER=<telegram-api-server-url>
TELEGRAM_API_ID=<telegram-api-id>
TELEGRAM_API_HASH=<telegram-api-hash>
DOWNLOAD_PATH=./downloads

# Optional
INCLUDE_USERBOT=false
UNLIMITED_USERS=<comma-separated-user-ids>
YTDLP_COOKIES=<cookies-content>
TELEGRAM_SESSION_STRING=<session-string>
PRIVATE_GROUP_ID=<private-group-id>
ADMIN_CHAT_ID=<admin-chat-id>
```

Build and start the bot:

```bash
npm run build
npm start
```

For development with automatic reloads:

```bash
npm run dev
```

## Docker Deployment

Create a `.env` file containing the required Telegram, Redis, download, and optional user-bot settings, then build and start the services:

```bash
docker compose build
docker compose up -d
```

The Compose configuration starts:

- The bot application
- Redis with persistent storage
- A local Telegram Bot API server with persistent storage

View application logs with:

```bash
docker compose logs -f video-downloader-bot
```

Stop the deployment with:

```bash
docker compose down
```
