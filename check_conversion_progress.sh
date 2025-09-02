#!/bin/bash

echo "🔍 EMBEDDING CONVERSION PROGRESS"
echo "================================"

# Check if process is running
if pgrep -f "auto_convert_embeddings.js" > /dev/null; then
    echo "✅ Conversion is RUNNING"
else
    echo "⚠️  Conversion process not found (may have completed)"
fi

echo ""

# Show latest log entries
if [ -f embedding_conversion.log ]; then
    echo "📊 Latest progress:"
    tail -5 embedding_conversion.log
else
    echo "Waiting for log file..."
fi

echo ""

# Check output log
if [ -f conversion_output.log ]; then
    echo "📝 Latest output:"
    tail -3 conversion_output.log
fi

echo ""
echo "================================"
echo "Full logs: cat embedding_conversion.log"
echo "Live monitor: tail -f embedding_conversion.log"
