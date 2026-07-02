# Stage 1: Grab pre-compiled ffmpeg binaries
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

# Stage 2: Main application build
FROM node:22-slim
WORKDIR /app

# Install base system packages (including python3 for yt-dlp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip xz-utils ca-certificates tini python3 \
    && rm -rf /var/lib/apt/lists/*

# Create bin directory
RUN mkdir -p /app/bin

# Copy ffmpeg directly from the first stage
COPY --from=ffmpeg /ffmpeg /app/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /app/bin/ffprobe
RUN chmod +x /app/bin/ffmpeg /app/bin/ffprobe

# Download latest yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /app/bin/yt-dlp \
    && chmod +x /app/bin/yt-dlp

# Ensure /app/bin is in PATH
ENV PATH="/app/bin:${PATH}"

# Copy package files and install deps
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]