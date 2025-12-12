#!/bin/bash
set -e

# Create venv
python3 -m venv venv
source venv/bin/activate

# Install gdown
pip install --no-cache-dir gdown --quiet


# Download Cookie from Google Drive
if [ -n "$FILE_ID" ]; then
    echo "Downloading cookies.zip from Google Drive..."
    gdown "https://drive.google.com/uc?id=$FILE_ID" -O cookies.zip

    if [ -f cookies.zip ]; then
        echo "Extracting cookies..."
        unzip -oq cookies.zip -d ./bin || { 
            echo "❌ Failed to extract cookies.zip"
            exit 1
        }
        rm cookies.zip
        echo "✔ cookies loaded"
    else
        echo "❌ Failed to download cookies.zip"
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