#!/bin/bash

echo "⚡ FAST CONVERSION MONITOR"
echo "========================"

# Check if process is running
if pgrep -f "super_fast_converter.js" > /dev/null; then
    echo "✅ Fast conversion is RUNNING"
    
    # Show process info
    ps aux | grep super_fast_converter.js | grep -v grep | head -1
else
    echo "⚠️  Conversion process not found (may have completed)"
fi

echo ""

# Show latest progress
if [ -f fast_conversion.log ]; then
    echo "📊 Latest progress:"
    tail -3 fast_conversion.log
    echo ""
    
    # Calculate rough ETA
    converted=$(tail -20 fast_conversion.log | grep -o 'Rate: [0-9.]*' | tail -1 | cut -d' ' -f2)
    if [ ! -z "$converted" ]; then
        remaining=$(tail -5 fast_conversion.log | grep -o 'Remaining: [0-9]*' | tail -1 | cut -d' ' -f2)
        if [ ! -z "$remaining" ]; then
            eta=$(echo "scale=1; $remaining / $converted / 60" | bc -l 2>/dev/null)
            if [ ! -z "$eta" ]; then
                echo "⏱️  Estimated completion: ${eta} minutes"
            fi
        fi
    fi
else
    echo "Waiting for log file..."
fi

echo ""
echo "========================"
echo "Live monitor: tail -f fast_conversion.log"
