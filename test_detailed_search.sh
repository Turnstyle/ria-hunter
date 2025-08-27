#!/bin/bash
echo "🧪 Testing Semantic Search in Detail"
echo "====================================="
echo ""

# Test retirement planning query
echo "Query: 'RIAs specializing in retirement planning'"
RESPONSE=$(curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"RIAs specializing in retirement planning"}')

echo ""
echo "📊 Search Strategy & Confidence:"
echo "$RESPONSE" | jq '.metadata | {searchStrategy, queryType, confidence}' 2>/dev/null

echo ""
echo "🎯 Top 5 Results with Similarity Scores:"
echo "$RESPONSE" | jq '.sources[:5] | .[] | {name: .legal_name, similarity, city, state}' 2>/dev/null

echo ""
echo "📈 Similarity Score Distribution:"
echo "$RESPONSE" | jq '[.sources[].similarity] | {min: min, max: max, avg: (add/length), unique_values: unique}' 2>/dev/null

echo ""
echo "✅ Semantic Search Health Check:"
CONF=$(echo "$RESPONSE" | jq '.metadata.confidence' 2>/dev/null)
if (( $(echo "$CONF > 0" | bc -l) )); then
  echo "   ✓ Confidence score present: $CONF"
else
  echo "   ✗ No confidence score"
fi

UNIQUE_SIMS=$(echo "$RESPONSE" | jq '[.sources[].similarity] | unique | length' 2>/dev/null)
if [[ $UNIQUE_SIMS -gt 1 ]]; then
  echo "   ✓ Varying similarity scores (good!)"
else
  echo "   ✗ All similarity scores are the same (bad!)"
fi

if echo "$RESPONSE" | jq -e '.sources[0].legal_name' | grep -qi "retirement"; then
  echo "   ✓ Results contain retirement-related RIAs"
else
  echo "   ⚠️  Results may not be semantically relevant"
fi
