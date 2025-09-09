#!/bin/bash

# Script to clean up old API endpoints after migration to /api/ask/*
# Run this ONLY after confirming the frontend is fully migrated and working

echo "🔄 API Migration to /api/ask/* Structure"
echo "========================================"
echo ""
echo "This script will remove old API endpoints after migration."
echo "⚠️  ONLY run this after confirming the frontend works with /api/ask/*"
echo ""

# Check if the new endpoints exist
if [ ! -d "app/api/ask/search" ] || [ ! -d "app/api/ask/browse" ] || [ ! -d "app/api/ask/profile" ]; then
  echo "❌ Error: New /api/ask/* endpoints not found!"
  echo "   Make sure the migration is complete before running this script."
  exit 1
fi

echo "✅ New /api/ask/* endpoints found"
echo ""

# List of old endpoints to remove
OLD_ENDPOINTS=(
  "app/api/v1/ria/query"
  "app/api/v1/ria/search"
  "app/api/ria/search-simple"
  "app/api/ask-stream"
  "app/api/test-search"
  "app/api/test-ai-search"
  "app/api/test-backend-fix"
  "app/api/test-embedding"
  "app/api/test-post"
)

echo "The following old endpoints will be removed:"
for endpoint in "${OLD_ENDPOINTS[@]}"; do
  if [ -d "$endpoint" ]; then
    echo "   ✓ $endpoint"
  fi
done

echo ""
echo "The following will be kept:"
echo "   ✓ /api/ask (main search)"
echo "   ✓ /api/ask/search (explicit search)"
echo "   ✓ /api/ask/browse (browse without query)"
echo "   ✓ /api/ask/profile/[crd] (RIA profiles)"
echo ""

read -p "Are you sure you want to proceed? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "🧹 Cleaning up old endpoints..."
  
  for endpoint in "${OLD_ENDPOINTS[@]}"; do
    if [ -d "$endpoint" ]; then
      echo "   Removing $endpoint..."
      rm -rf "$endpoint"
    fi
  done
  
  # Also clean up old helper files if they exist
  if [ -f "app/api/ask/planner.ts" ]; then
    echo "   Removing old planner.ts..."
    rm -f "app/api/ask/planner.ts"
  fi
  
  if [ -f "app/api/ask/generator.ts" ]; then
    echo "   Removing old generator.ts..."
    rm -f "app/api/ask/generator.ts"
  fi
  
  if [ -f "app/api/ask/retriever.ts" ]; then
    echo "   Removing old retriever.ts..."
    rm -f "app/api/ask/retriever.ts"
  fi
  
  if [ -f "app/api/ask/unified-search.ts" ]; then
    echo "   Removing old unified-search.ts..."
    rm -f "app/api/ask/unified-search.ts"
  fi
  
  if [ -f "app/api/ask/route-old.ts" ]; then
    echo "   Removing backup route-old.ts..."
    rm -f "app/api/ask/route-old.ts"
  fi
  
  echo ""
  echo "✅ Cleanup complete!"
  echo ""
  echo "📝 Next steps:"
  echo "   1. Update middleware.ts to remove references to old endpoints"
  echo "   2. Test the application thoroughly"
  echo "   3. Deploy to production"
  echo ""
  echo "The API is now clean with only /api/ask/* endpoints!"
else
  echo "❌ Migration cancelled"
  exit 0
fi
