#!/bin/bash

# 1️⃣ Install Python 3 and pip
apt-get update && apt-get install -y python3 python3-pip ffmpeg curl

# 2️⃣ Install yt-dlp
pip3 install --upgrade yt-dlp

# 3️⃣ Start bot
node src/server.js