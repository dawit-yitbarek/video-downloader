# Stage 1: Grab static FFmpeg binaries
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

# Stage 2: Build TypeScript source
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 3: Production Runner
FROM node:22-slim AS runner
WORKDIR /app

# Install base packages, python3, pip, and curl_cffi for yt-dlp TLS impersonation
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip xz-utils ca-certificates tini python3 python3-pip \
    && pip3 install --default-timeout=1000 --retries=10 --no-cache-dir --break-system-packages curl_cffi \
    && rm -rf /var/lib/apt/lists/*

# Copy FFmpeg binaries from stage 1
COPY --from=ffmpeg /ffmpeg bin/ffmpeg
COPY --from=ffmpeg /ffprobe bin/ffprobe
RUN chmod +x bin/ffmpeg bin/ffprobe

# Download standalone yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o bin/yt-dlp \
    && chmod +x bin/yt-dlp

# Download standalone gallery-dl binary from Codeberg
RUN curl -L https://codeberg.org/mikf/gallery-dl/releases/download/v1.32.12/gallery-dl.bin -o bin/gallery-dl \
    && chmod +x bin/gallery-dl

ENV PATH="/app/bin:${PATH}"

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]