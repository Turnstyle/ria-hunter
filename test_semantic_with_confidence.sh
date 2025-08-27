#!/bin/bash
echo "Testing semantic search with confidence scores..."
echo ""

# Test query
RESPONSE=$(curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"RIAs specializing in retirement planning"}')

# Extract and display key metrics
echo "📊 Metadata:"
echo "$RESPONSE" | jq '.metadata' 2>/dev/null
echo ""

echo "🎯 First Result:"
echo "$RESPONSE" | jq '.sources[0] | {legal_name, city, state, similarity, source}' 2>/dev/null
echo ""

echo "💯 Confidence Score:"
echo "$RESPONSE" | jq '.metadata.confidence' 2>/dev/null
echo ""

echo "📈 All Similarity Scores:"
echo "$RESPONSE" | jq '.sources[] | {legal_name, similarity}' 2>/dev/null | head -20
