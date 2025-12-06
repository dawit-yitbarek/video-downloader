#!/bin/bash

# Ensure ffmpeg exists
apt-get update && apt-get install -y ffmpeg

# Install Python packages
pip install -r requirements.txt

# Start bot
node src/server.js
