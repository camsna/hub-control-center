#!/bin/bash
set -e

LOG_FILE="/app/logs/runner.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] === Starting scraper run ===" >> "$LOG_FILE"

cd /app

# Run the scraper with full path to python3
/usr/local/bin/python3 scrape.py >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] === Scraper finished with exit code: $EXIT_CODE ===" >> "$LOG_FILE"

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$TIMESTAMP] ✅ Success - latest.csv updated" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] ❌ Error - scraper failed" >> "$LOG_FILE"
fi

exit $EXIT_CODE