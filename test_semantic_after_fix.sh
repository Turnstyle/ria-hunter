#!/bin/bash
echo "Testing semantic search after fix..."
curl -X POST https://ria-hunter.app/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"RIAs specializing in retirement planning"}' \
  2>/dev/null | jq '{
    strategy: .metadata.searchStrategy,
    confidence: .metadata.confidence,
    results: .data | length,
    top_result: .data[0].legal_name
  }'
