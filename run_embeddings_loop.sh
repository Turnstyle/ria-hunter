#!/bin/bash

# Continuous embedding loop script
cd /Users/turner/projects/ria-hunter

export SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM

echo "🚀 Starting continuous embedding process..."
echo "========================================"
echo

iteration=1

while true; do
    echo "🔄 Starting embedding batch #$iteration at $(date)"
    
    # Check current status
    echo "Checking current progress..."
    node seed/check_embeddings.mjs
    echo
    
    # Run embedding script
    echo "Running embedding script..."
    npx tsx seed/embed_narratives_custom.ts
    
    # Check if we're done
    echo "Checking completion status..."
    result=$(node seed/check_embeddings.mjs | grep "Without embeddings: 0")
    
    if [[ -n "$result" ]]; then
        echo "🎉 All embeddings complete!"
        break
    fi
    
    echo "✅ Batch #$iteration completed. Starting next batch in 5 seconds..."
    echo "============================================================"
    echo
    sleep 5
    
    ((iteration++))
done

echo "🎉 Embedding process fully complete!"
echo "Final status:"
node seed/check_embeddings.mjs