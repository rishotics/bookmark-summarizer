#!/bin/bash
# Installs a daily cron job to run the bookmark summarizer at 6 AM IST (00:30 UTC)

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_CMD="30 0 * * * cd $SCRIPT_DIR && python -m summarizer 2>&1 >> $SCRIPT_DIR/data/cron.log"

# Check if cron job already exists
(crontab -l 2>/dev/null | grep -q "bookmark-summarizer") && {
    echo "Cron job already exists. Remove it first with: crontab -e"
    exit 1
}

# Create data directory for logs
mkdir -p "$SCRIPT_DIR/data"

# Add cron job
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
echo "Cron job installed!"
echo "Schedule: 6:00 AM IST (00:30 UTC) daily"
echo "Logs: $SCRIPT_DIR/data/cron.log"
