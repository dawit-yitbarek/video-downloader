#!/bin/bash


# 1. Create cookies.txt from Render environment var
mkdir -p ./src/bin
if [ -n "$YTDLP_COOKIES" ]; then
    echo "$YTDLP_COOKIES" > ./src/bin/cookies.txt
    chmod 600 ./src/bin/cookies.txt
    echo "Cookies loaded ✔"
else
    echo "No cookies found in environment ❌"
fi

# Download latest static ffmpeg build
echo "Downloading FFmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz

# Extract the archive
echo "Extracting FFmpeg..."
tar -xf ffmpeg.tar.xz

# Move the ffmpeg binary to project folder
mv ffmpeg-*-amd64-static/ffmpeg ./src/bin/ffmpeg
mv ffmpeg-*-amd64-static/ffprobe ./src/bin/ffprobe

# Execute
chmod +x ./src/bin/ffmpeg
chmod +x ./src/bin/ffprobe

# Cleanup
rm -rf ffmpeg-*-amd64-static ffmpeg.tar.xz
echo "FFmpeg ready ✔"

# 3. Download Linux yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./src/bin/yt-dlp
chmod +x ./src/bin/yt-dlp
echo "yt-dlp ready ✔"

# 4. Start the Node server
node ./src/server.js