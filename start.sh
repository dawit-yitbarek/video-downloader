#!/bin/bash

# Install system tools
apt-get update
apt-get install -y curl ffmpeg

# Install yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Run Node server
node src/server.js