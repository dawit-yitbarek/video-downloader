#!/bin/bash
set -e

# Create venv 
python3 -m venv venv 
source venv/bin/activate

# Install gdown
pip install --no-cache-dir gdown --quiet

# Load Puppeteer profiles
mkdir -p ./src/bin

# Download latest Chromium snapshot
echo "Fetching latest Chromium snapshot ID..."
LATEST=$(curl -s https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/LAST_CHANGE)
echo "Latest build is $LATEST"

curl -L "https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/$LATEST/chrome-linux.zip" -o chromium.zip
unzip -oq chromium.zip -d ./src/bin/
if [ ! -f ./src/bin/chrome-linux/chrome ]; then
    echo "❌ Chromium binary not found after extraction"
    exit 1
fi

chmod +x ./src/bin/chrome-linux/chrome
rm -rf chromium.zip
echo "Chromium ready ✔"

# Download Puppeteer profiles from Google Drive
if [ -n "$FILE_ID" ]; then
    echo "Downloading puppeteer-profiles.zip from Google Drive..."
    gdown "https://drive.google.com/uc?id=$FILE_ID" -O puppeteer-profiles.zip

    if [ -f puppeteer-profiles.zip ]; then
        echo "Extracting puppeteer profiles..."
        unzip -oq puppeteer-profiles.zip -d . || { 
            echo "❌ Failed to extract puppeteer-profiles.zip"
            exit 1
        }
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