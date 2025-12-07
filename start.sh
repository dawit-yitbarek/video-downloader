#!/bin/bash

# Install system dependencies
apt-get update
apt-get install -y curl ffmpeg

# Download Linux yt-dlp binary
mkdir -p ./src/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./src/bin/yt-dlp
chmod +x ./src/bin/yt-dlp

# Start the server
node ./src/server.js