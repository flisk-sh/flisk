#!/bin/bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# ============================================================================
# Cron Jobs Status Tracker
# Tracks execution status of all cron jobs
# ============================================================================

STATUS_FILE="/tmp/cron-jobs-status.json"
CONTROL_DIR="/tmp/cron-jobs-control"
LOG_DIR="/tmp/cron-jobs-logs"

# Ensure directories exist
mkdir -p "$CONTROL_DIR" "$LOG_DIR"

# Initialize status file
init_status() {
    cat > "$STATUS_FILE" << 'EOF'
{
  "jobs": [
    {
      "name": "cron-lint",
      "status": "idle",
      "lastRun": null,
      "nextRun": null,
      "history": []
    },
    {
      "name": "cron-format",
      "status": "idle",
      "lastRun": null,
      "nextRun": null,
      "history": []
    },
    {
      "name": "auto-prune-dangling",
      "status": "running",
      "lastRun": null,
      "nextRun": null,
      "history": []
    },
    {
      "name": "auto-prune-migrator-images",
      "status": "running",
      "lastRun": null,
      "nextRun": null,
      "history": []
    }
  ],
  "updatedAt": null
}
EOF
}

# Update job status
update_job() {
    local name=$1
    local status=$2
    local duration=$3
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Read current status
    local current=$(cat "$STATUS_FILE" 2>/dev/null || echo '{"jobs":[]}')

    # Calculate next run (60 seconds from now for cron jobs)
    local nextRun=$(date -u -v+60S +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '+60 seconds' +"%Y-%m-%dT%H:%M:%SZ")

    # Update using Python for reliable JSON manipulation
    python3 << PYEOF
import json
import sys
from datetime import datetime, timedelta

data = json.loads('''$current''')
job_name = '''$name'''
status = '''$status'''
timestamp = '''$timestamp'''
duration = '''$duration'''
next_run = '''$nextRun'''

# Find and update job
for job in data.get('jobs', []):
    if job['name'] == job_name:
        job['status'] = status
        job['lastRun'] = timestamp
        job['nextRun'] = next_run

        # Add to history
        if 'history' not in job:
            job['history'] = []

        job['history'].insert(0, {
            'time': timestamp,
            'status': status,
            'duration': duration if duration else 'N/A'
        })

        # Keep only last 10 entries
        job['history'] = job['history'][:10]
        break

data['updatedAt'] = timestamp
print(json.dumps(data, indent=2))
PYEOF
}

# Check if job should pause
check_pause() {
    local name=$1
    if [[ -f "$CONTROL_DIR/$name.pause" ]]; then
        return 0
    fi
    return 1
}

# Check if manual trigger requested
check_trigger() {
    local name=$1
    if [[ -f "$CONTROL_DIR/$name.trigger" ]]; then
        rm "$CONTROL_DIR/$name.trigger"
        return 0
    fi
    return 1
}

# Main execution
command=$1
shift

case $command in
    init)
        init_status
        echo "Status file initialized at $STATUS_FILE"
        ;;
    update)
        update_job "$1" "$2" "$3" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"
        ;;
    pause-check)
        check_pause "$1"
        ;;
    trigger-check)
        check_trigger "$1"
        ;;
    *)
        echo "Usage: $0 {init|update <name> <status> [duration]|pause-check <name>|trigger-check <name>}"
        exit 1
        ;;
esac
