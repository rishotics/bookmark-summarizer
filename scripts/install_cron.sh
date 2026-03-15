#!/bin/bash
# Installs a daily cron job to run the bookmark summarizer at 8 AM

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_CMD="0 8 * * * cd $SCRIPT_DIR && python -m summarizer 2>&1 >> $SCRIPT_DIR/data/cron.log"

# Check if cron job already exists
(crontab -l 2>/dev/null | grep -q "bookmark-summarizer") && {
    echo "Cron job already exists. Remove it first with: crontab -e"
    exit 1
}

# Add cron job
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
echo "Cron job installed. Bookmark digest will run daily at 8:00 AM."
echo "Logs: $SCRIPT_DIR/data/cron.log"
