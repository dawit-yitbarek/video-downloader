#!/bin/bash

# Ensure bin folder exists
mkdir -p ./bin

# Download yt-dlp locally into ./bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp
chmod +x ./bin/yt-dlp

# apt-get update && apt-get install -y ffmpeg

# Start Node server
node src/server.js