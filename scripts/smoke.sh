#!/usr/bin/env bash

set -euo pipefail

# Use provided APP_URL or default to production
APP_URL="${APP_URL:-https://ria-hunter.app}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== RIA Hunter Backend Smoke Tests ===${NC}"
echo "Testing against: $APP_URL"
echo ""

# Test 1: Anonymous credits/balance endpoint
echo -e "${YELLOW}1) Testing anonymous credits/balance endpoint${NC}"
echo "   Should return 200 with credits=15 and isSubscriber=false"
echo ""

# Capture headers and body
echo "Request: GET $APP_URL/_backend/api/credits/balance"
RESPONSE=$(curl -sS -w "\n%{http_code}" "$APP_URL/_backend/api/credits/balance" 2>/dev/null || echo "CURL_ERROR")

if [[ "$RESPONSE" == "CURL_ERROR" ]]; then
    echo -e "${RED}✗ Failed to connect to API${NC}"
    exit 1
fi

# Extract HTTP status code and body (macOS compatible)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Get all lines except the last one
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

if [[ "$HTTP_CODE" == "200" ]]; then
    # Check for required fields
    HAS_CREDITS=$(echo "$BODY" | jq 'has("credits")' 2>/dev/null || echo "false")
    HAS_SUBSCRIBER=$(echo "$BODY" | jq 'has("isSubscriber")' 2>/dev/null || echo "false")
    CREDITS_VALUE=$(echo "$BODY" | jq '.credits' 2>/dev/null || echo "null")
    IS_SUBSCRIBER=$(echo "$BODY" | jq '.isSubscriber' 2>/dev/null || echo "null")
    
    if [[ "$HAS_CREDITS" == "true" && "$HAS_SUBSCRIBER" == "true" ]]; then
        if [[ "$CREDITS_VALUE" == "15" && "$IS_SUBSCRIBER" == "false" ]]; then
            echo -e "${GREEN}✓ Anonymous balance endpoint working correctly${NC}"
        else
            echo -e "${YELLOW}⚠ Response has correct shape but unexpected values${NC}"
            echo "  Expected: credits=15, isSubscriber=false"
            echo "  Got: credits=$CREDITS_VALUE, isSubscriber=$IS_SUBSCRIBER"
        fi
    else
        echo -e "${RED}✗ Response missing required fields (credits, isSubscriber)${NC}"
    fi
else
    echo -e "${RED}✗ Expected status 200, got $HTTP_CODE${NC}"
fi

echo ""

# Test 2: Stripe webhook health check (GET with ?ping=1)
echo -e "${YELLOW}2) Testing Stripe webhook health check${NC}"
echo "   GET handler should return 200"
echo ""

echo "Request: GET $APP_URL/_backend/api/stripe-webhook?ping=1"
RESPONSE=$(curl -sS -w "\n%{http_code}" "$APP_URL/_backend/api/stripe-webhook?ping=1" 2>/dev/null || echo "CURL_ERROR")

if [[ "$RESPONSE" == "CURL_ERROR" ]]; then
    echo -e "${RED}✗ Failed to connect to webhook endpoint${NC}"
else
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo "Status: $HTTP_CODE"
    echo "Response body:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    
    if [[ "$HTTP_CODE" == "200" ]]; then
        OK_VALUE=$(echo "$BODY" | jq '.ok' 2>/dev/null || echo "null")
        if [[ "$OK_VALUE" == "true" ]]; then
            echo -e "${GREEN}✓ Webhook health check working${NC}"
        else
            echo -e "${YELLOW}⚠ Webhook responded but ok != true${NC}"
        fi
    else
        echo -e "${RED}✗ Expected status 200, got $HTTP_CODE${NC}"
    fi
fi

echo ""

# Test 3: Chat/streaming endpoint health check (HEAD request)
echo -e "${YELLOW}3) Testing chat streaming endpoint${NC}"
echo "   HEAD request should return 200 or OPTIONS should work"
echo ""

# Try HEAD request first
echo "Request: HEAD $APP_URL/api/ask-stream"
HEAD_STATUS=$(curl -sS -I -X HEAD "$APP_URL/api/ask-stream" 2>/dev/null | grep "HTTP" | awk '{print $2}' || echo "0")

if [[ "$HEAD_STATUS" == "200" || "$HEAD_STATUS" == "204" ]]; then
    echo "Status: $HEAD_STATUS"
    echo -e "${GREEN}✓ Chat endpoint is accessible${NC}"
else
    # Try OPTIONS as fallback
    echo "HEAD returned $HEAD_STATUS, trying OPTIONS..."
    echo "Request: OPTIONS $APP_URL/api/ask-stream"
    OPTIONS_STATUS=$(curl -sS -I -X OPTIONS "$APP_URL/api/ask-stream" 2>/dev/null | grep "HTTP" | awk '{print $2}' || echo "0")
    
    if [[ "$OPTIONS_STATUS" == "200" || "$OPTIONS_STATUS" == "204" ]]; then
        echo "Status: $OPTIONS_STATUS"
        echo -e "${GREEN}✓ Chat endpoint CORS is configured${NC}"
    else
        echo -e "${YELLOW}⚠ Chat endpoint may need configuration (HEAD: $HEAD_STATUS, OPTIONS: $OPTIONS_STATUS)${NC}"
    fi
fi

echo ""

# Test 4: Balance API alias check (optional)
echo -e "${YELLOW}4) Testing balance API alias${NC}"
echo "   Checking if /api/credits/balance redirects properly"
echo ""

echo "Request: GET $APP_URL/api/credits/balance"
ALIAS_RESPONSE=$(curl -sS -w "\n%{http_code}" "$APP_URL/api/credits/balance" 2>/dev/null || echo "CURL_ERROR")

if [[ "$ALIAS_RESPONSE" != "CURL_ERROR" ]]; then
    ALIAS_CODE=$(echo "$ALIAS_RESPONSE" | tail -n1)
    ALIAS_BODY=$(echo "$ALIAS_RESPONSE" | sed '$d')
    
    echo "Status: $ALIAS_CODE"
    
    if [[ "$ALIAS_CODE" == "200" ]]; then
        echo -e "${GREEN}✓ Balance API alias working${NC}"
    else
        echo -e "${YELLOW}⚠ Alias endpoint returned $ALIAS_CODE${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not reach alias endpoint${NC}"
fi

echo ""
echo -e "${YELLOW}=== Smoke Test Summary ===${NC}"
echo ""

# Quick re-test for summary
BALANCE_OK=$(curl -sS "$APP_URL/_backend/api/credits/balance" 2>/dev/null | jq 'has("credits") and has("isSubscriber")' 2>/dev/null || echo "false")
WEBHOOK_OK=$(curl -sS "$APP_URL/_backend/api/stripe-webhook?ping=1" 2>/dev/null | jq '.ok' 2>/dev/null || echo "false")

if [[ "$BALANCE_OK" == "true" ]]; then
    echo -e "${GREEN}✓${NC} Credits/Balance API: Working"
else
    echo -e "${RED}✗${NC} Credits/Balance API: Issues detected"
fi

if [[ "$WEBHOOK_OK" == "true" ]]; then
    echo -e "${GREEN}✓${NC} Stripe Webhook: Healthy"
else
    echo -e "${RED}✗${NC} Stripe Webhook: Issues detected"
fi

echo ""

# Exit with appropriate code
if [[ "$BALANCE_OK" == "true" && "$WEBHOOK_OK" == "true" ]]; then
    echo -e "${GREEN}All critical endpoints are functional!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some endpoints need attention${NC}"
    exit 1
fi
