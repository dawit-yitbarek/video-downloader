FROM node:18-slim
WORKDIR /app

# Install base system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip xz-utils ca-certificates tini python3 \
    && rm -rf /var/lib/apt/lists/*

# Create bin directory
RUN mkdir -p /app/bin

# Download latest static ffmpeg build
RUN curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz \
    && tar -xf ffmpeg.tar.xz \
    && mv ffmpeg-*-amd64-static/ffmpeg /app/bin/ffmpeg \
    && mv ffmpeg-*-amd64-static/ffprobe /app/bin/ffprobe \
    && chmod +x /app/bin/ffmpeg /app/bin/ffprobe \
    && rm -rf ffmpeg-*-amd64-static ffmpeg.tar.xz

# Download latest yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /app/bin/yt-dlp \
    && chmod +x /app/bin/yt-dlp

# Download and install rclone
RUN curl -L https://downloads.rclone.org/rclone-current-linux-amd64.zip -o rclone.zip \
    && unzip -j rclone.zip "*/rclone" -d /app/bin/ \
    && chmod +x /app/bin/rclone \
    && rm rclone.zip

# Ensure /app/bin is in PATH
ENV PATH="/app/bin:${PATH}"

# Copy package files and install deps (cached unless package.json changes)
COPY package*.json ./
RUN npm install

# Copy source code last (only this layer rebuilds when files edited)
COPY . .

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]