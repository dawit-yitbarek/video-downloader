#!/bin/bash
set -e

# Create venv
python3 -m venv venv
source venv/bin/activate

# Install gdown inside venv
pip install --no-cache-dir gdown --quiet

# Load Puppeteer profiles
mkdir -p ./src/bin
if [ -n "$FILE_ID" ]; then
    echo "Downloading puppeteer-profiles.zip from Google Drive..."
    gdown "https://drive.google.com/uc?id=$FILE_ID" -O puppeteer-profiles.zip

    if [ -f puppeteer-profiles.zip ]; then
        unzip -o puppeteer-profiles.zip -d .
        rm puppeteer-profiles.zip
        echo "✔ puppeteer-profiles loaded"
    else
        echo "❌ Failed to download puppeteer-profiles.zip"
        exit 1
    fi
else
    echo "❌ No FILE_ID environment variable found"
    exit 1
fi

# Download latest static ffmpeg build
echo "Downloading FFmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz
mv ffmpeg-*-amd64-static/ffmpeg ./src/bin/ffmpeg
mv ffmpeg-*-amd64-static/ffprobe ./src/bin/ffprobe
chmod +x ./src/bin/ffmpeg ./src/bin/ffprobe
rm -rf ffmpeg-*-amd64-static ffmpeg.tar.xz
echo "FFmpeg ready ✔"

# Download Linux yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./src/bin/yt-dlp
chmod +x ./src/bin/yt-dlp
echo "yt-dlp ready ✔"

# Start Node server
node ./src/server.js