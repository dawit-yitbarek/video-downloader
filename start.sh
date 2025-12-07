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

# 2. Download Linux yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./src/bin/yt-dlp
chmod +x ./src/bin/yt-dlp
echo "yt-dlp ready ✔"

# 3. Start the Node server
node ./src/server.js