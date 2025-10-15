#!/bin/bash
# Script to start a single narrative generation process (avoiding rate limiting)

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing narrative generators to ensure a clean start
pkill -f 'improved_narrative_generator.js' || true

echo "Starting single narrative generation process..."
echo "This will work alongside the name fixing process, processing RIAs as their names are fixed."

# Start the narrative generation with optimized but conservative settings
node scripts/improved_narrative_generator.js --batch-size 10 --delay 5 > logs/narrative_generation.log 2>&1 &
NARRATIVE_PID=$!

echo "Narrative generation started with PID $NARRATIVE_PID"
echo "To monitor progress, use:"
echo "tail -f logs/narrative_generation.log"
echo ""
echo "The process will automatically skip RIAs with undefined names and process those with names."
