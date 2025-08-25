#!/bin/bash
# Monitor and restart script for narrative generation
# Implements optimization with fallback strategy

# Log file
LOG_FILE="logs/narrative_optimization.log"

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Create logs directory if it doesn't exist
mkdir -p logs

log "Starting narrative optimization process"

# Store the process ID of the current running process
CURRENT_PID=$(pgrep -f "final_narrative_generator.js" || echo "")

if [ -n "$CURRENT_PID" ]; then
    log "Found existing narrative generator process (PID: $CURRENT_PID). Stopping it..."
    kill $CURRENT_PID
    sleep 5
    
    # Check if it's still running
    if ps -p $CURRENT_PID > /dev/null; then
        log "Process is still running. Sending SIGKILL..."
        kill -9 $CURRENT_PID
        sleep 2
    fi
    
    log "Previous process stopped"
else
    log "No existing narrative generator process found"
fi

# Start with optimized settings
log "Starting optimized narrative generator (batch size: 8, delay: 20s)"
node scripts/optimized_narrative_generator.js &
PROCESS_PID=$!
log "Started with PID: $PROCESS_PID"

# Monitor the process
log "Monitoring process for rate limiting issues..."

while true; do
    sleep 30
    
    # Check if process is still running
    if ! ps -p $PROCESS_PID > /dev/null; then
        EXIT_CODE=$?
        log "Process exited with code: $EXIT_CODE"
        
        case $EXIT_CODE in
            0)
                log "Process completed successfully."
                break
                ;;
            2)
                log "Rate limiting detected. Restarting with reduced batch size (5) and same delay (20s)"
                # Modify script for batch size 5, delay 20s
                sed -i '' 's/const BATCH_SIZE = 8;/const BATCH_SIZE = 5;/' scripts/optimized_narrative_generator.js
                node scripts/optimized_narrative_generator.js &
                PROCESS_PID=$!
                log "Restarted with PID: $PROCESS_PID and batch size 5"
                ;;
            3)
                log "Rate limiting detected. Restarting with batch size (5) and increased delay (30s)"
                # Modify script for batch size 5, delay 30s
                sed -i '' 's/const BATCH_SIZE = [0-9]*;/const BATCH_SIZE = 5;/' scripts/optimized_narrative_generator.js
                sed -i '' 's/const DELAY_BETWEEN_BATCHES = [0-9]*;/const DELAY_BETWEEN_BATCHES = 30000;/' scripts/optimized_narrative_generator.js
                node scripts/optimized_narrative_generator.js &
                PROCESS_PID=$!
                log "Restarted with PID: $PROCESS_PID, batch size 5, delay 30s"
                ;;
            *)
                log "Process failed with unexpected error. Falling back to original configuration."
                # Fallback to original settings
                sed -i '' 's/const BATCH_SIZE = [0-9]*;/const BATCH_SIZE = 5;/' scripts/optimized_narrative_generator.js
                sed -i '' 's/const DELAY_BETWEEN_BATCHES = [0-9]*;/const DELAY_BETWEEN_BATCHES = 30000;/' scripts/optimized_narrative_generator.js
                node scripts/optimized_narrative_generator.js &
                PROCESS_PID=$!
                log "Restarted with PID: $PROCESS_PID using original settings"
                ;;
        esac
    else
        # Check logs for rate limiting signs
        if grep -q "Rate limit hit" logs/optimized_narrative_generation.log; then
            log "Rate limiting detected in logs"
        else
            log "Process running normally"
        fi
    fi
done

log "Monitoring complete"
