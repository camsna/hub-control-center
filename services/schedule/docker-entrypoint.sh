#!/bin/bash
set -e

echo "================================"
echo "EventTemple Scraper Container"
echo "================================"
echo ""

# Check if auth.json exists
if [ ! -f /app/data/auth.json ]; then
    echo "⚠️  WARNING: auth.json not found in /app/data/"
    echo "Please run SESSION_GETTER.py on your local machine first,"
    echo "then copy auth.json to the mounted data directory."
    echo ""
fi

echo "Starting cron daemon..."
cron

echo "✅ Container is running"
echo "Scheduled runs: 01:00 and 13:00 Europe/Oslo time"
echo "Logs: /app/logs/"
echo "Output: /app/data/latest.csv"
echo ""

# Keep container running and tail logs
touch /app/logs/runner.log
echo "Tailing logs (Ctrl+C to stop)..."
tail -f /app/logs/runner.log
