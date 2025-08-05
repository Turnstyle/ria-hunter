#!/bin/bash

# Monitor script for narrative embedding progress
cd /Users/turner/projects/ria-hunter

echo "🔄 Monitoring Narrative Embedding Progress"
echo "=========================================="
echo

while true; do
    clear
    echo "🔄 Monitoring Narrative Embedding Progress"
    echo "=========================================="
    echo "$(date)"
    echo
    
    # Check progress
    SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM \
    node seed/check_embeddings.mjs
    
    echo
    echo "Press Ctrl+C to stop monitoring"
    echo "Next update in 30 seconds..."
    
    sleep 30
done