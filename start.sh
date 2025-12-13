#!/bin/bash
set -e

# Create venv
python3 -m venv venv
source venv/bin/activate

# Download latest static ffmpeg build
echo "Downloading FFmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz

# Create bin directory if it doesn't exist
mkdir -p ./bin

# Move ffmpeg and ffprobe to the bin directory
mv ffmpeg-*-amd64-static/ffmpeg ./bin/ffmpeg
mv ffmpeg-*-amd64-static/ffprobe ./bin/ffprobe
chmod +x ./bin/ffmpeg ./bin/ffprobe
rm -rf ffmpeg-*-amd64-static ffmpeg.tar.xz
echo "FFmpeg ready ✔"

# Download Linux yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o ./bin/yt-dlp

# Verify it's a binary, not HTML
if ! file ./bin/yt-dlp | grep -q ELF; then
    echo "❌ yt-dlp download failed (got HTML instead of binary)"
    exit 1
fi

chmod +x ./bin/yt-dlp
echo "yt-dlp ready ✔"

# Start Node server
node ./src/server.js