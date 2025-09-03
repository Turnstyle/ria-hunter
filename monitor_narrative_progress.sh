#!/bin/bash

# Monitor the progress of narrative reprocessing
# This script provides real-time updates on the processing progress

echo "🔄 RIA Hunter - Narrative Processing Monitor"
echo "=========================================="
echo ""

while true; do
    echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # Check if the process is still running
    if pgrep -f "reprocess_generic_narratives_fixed.js" > /dev/null; then
        echo "✅ Processing script is running"
        
        # Get current progress from the progress file
        if [ -f "logs/reprocess_narratives_fixed_progress.json" ]; then
            processed=$(cat logs/reprocess_narratives_fixed_progress.json | grep '"processed"' | sed 's/.*: \([0-9]*\).*/\1/')
            successful=$(cat logs/reprocess_narratives_fixed_progress.json | grep '"successful"' | sed 's/.*: \([0-9]*\).*/\1/')
            failed=$(cat logs/reprocess_narratives_fixed_progress.json | grep '"failed"' | sed 's/.*: \([0-9]*\).*/\1/')
            
            echo "📊 Progress: $processed processed, $successful successful, $failed failed"
            
            # Calculate completion percentage
            total=1879
            if [ "$processed" -gt 0 ]; then
                completion=$(( processed * 100 / total ))
                remaining=$(( total - processed ))
                echo "📈 Completion: $completion% ($remaining remaining)"
            fi
        else
            echo "⚠️  Progress file not found"
        fi
        
        # Show last few log entries
        echo ""
        echo "📝 Recent activity:"
        tail -3 logs/reprocess_narratives_fixed.log | while read line; do
            echo "   $line"
        done
        
    else
        echo "⛔ Processing script is not running"
        
        # Check final count
        echo ""
        echo "🔍 Checking final narrative count..."
        node check_remaining_generic.js 2>/dev/null || echo "Unable to check current count"
    fi
    
    echo ""
    echo "───────────────────────────────────────────────"
    echo ""
    
    # Wait 30 seconds before next update
    sleep 30
done
