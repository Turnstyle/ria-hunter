#!/bin/bash
# Script to verify CORS headers on all API routes
# Run this from the project root: ./scripts/verify_cors.sh

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Production URL - Change this to test different environments
API_URL=${1:-"https://ria-hunter.vercel.app"}
ORIGIN="https://www.ria-hunter.app"

# API routes to test
ROUTES=(
  "/api/ask-stream"
  "/api/ask"
  "/api/subscription-status"
  "/api/v1/ria/search"
  "/api/v1/ria/query"
)

echo -e "${YELLOW}Testing CORS for API URL: ${API_URL}${NC}"
echo -e "${YELLOW}Using Origin: ${ORIGIN}${NC}\n"

# Test OPTIONS preflight for each route
for route in "${ROUTES[@]}"; do
  echo -e "\n${YELLOW}Testing OPTIONS preflight for ${route}${NC}"
  
  response=$(curl -s -I -X OPTIONS \
    -H "Origin: ${ORIGIN}" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type, Authorization" \
    "${API_URL}${route}")
  
  status=$(echo "$response" | grep "HTTP" | awk '{print $2}')
  allow_origin=$(echo "$response" | grep -i "Access-Control-Allow-Origin" | cut -d' ' -f2- | tr -d '\r')
  allow_methods=$(echo "$response" | grep -i "Access-Control-Allow-Methods" | cut -d' ' -f2- | tr -d '\r')
  allow_headers=$(echo "$response" | grep -i "Access-Control-Allow-Headers" | cut -d' ' -f2- | tr -d '\r')
  allow_credentials=$(echo "$response" | grep -i "Access-Control-Allow-Credentials" | cut -d' ' -f2- | tr -d '\r')
  vary=$(echo "$response" | grep -i "Vary" | cut -d' ' -f2- | tr -d '\r')
  
  echo "Status: $status"
  echo "Access-Control-Allow-Origin: $allow_origin"
  echo "Access-Control-Allow-Methods: $allow_methods"
  echo "Access-Control-Allow-Headers: $allow_headers"
  echo "Access-Control-Allow-Credentials: $allow_credentials"
  echo "Vary: $vary"
  
  # Validate
  if [[ "$status" == "204" ]]; then
    echo -e "${GREEN}✓ Status 204 OK${NC}"
  else
    echo -e "${RED}✗ Status not 204${NC}"
  fi
  
  if [[ "$allow_origin" == "$ORIGIN" ]]; then
    echo -e "${GREEN}✓ Allow-Origin correctly set to requesting origin${NC}"
  elif [[ "$allow_origin" == "*" ]]; then
    echo -e "${RED}✗ Allow-Origin set to * (will fail with credentials)${NC}"
  else
    echo -e "${RED}✗ Allow-Origin incorrect: $allow_origin${NC}"
  fi
  
  if [[ "$allow_credentials" == "true" ]]; then
    echo -e "${GREEN}✓ Allow-Credentials set to true${NC}"
  else
    echo -e "${RED}✗ Allow-Credentials not set to true${NC}"
  fi
  
  if [[ "$vary" == *"Origin"* ]]; then
    echo -e "${GREEN}✓ Vary includes Origin${NC}"
  else
    echo -e "${RED}✗ Vary header missing Origin${NC}"
  fi
  
  if [[ "$allow_methods" == *"POST"* ]]; then
    echo -e "${GREEN}✓ Allow-Methods includes POST${NC}"
  else
    echo -e "${RED}✗ Allow-Methods missing POST${NC}"
  fi
  
  if [[ "$allow_methods" == *"OPTIONS"* ]]; then
    echo -e "${GREEN}✓ Allow-Methods includes OPTIONS${NC}"
  else
    echo -e "${RED}✗ Allow-Methods missing OPTIONS${NC}"
  fi
  
  if [[ "$allow_headers" == *"Content-Type"* && "$allow_headers" == *"Authorization"* ]]; then
    echo -e "${GREEN}✓ Allow-Headers includes necessary headers${NC}"
  else
    echo -e "${RED}✗ Allow-Headers missing required headers${NC}"
  fi
done

# Test SSE streaming endpoint specifically
echo -e "\n${YELLOW}Testing POST to streaming endpoint /api/ask-stream${NC}"
response_headers=$(curl -s -i -X POST \
  -H "Origin: ${ORIGIN}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"query":"test query"}' \
  "${API_URL}/api/ask-stream" | grep -i -E "^(HTTP|Content-Type|Access-Control-|Cache-Control|Connection|X-Accel-Buffering|Vary)")

echo "$response_headers"

content_type=$(echo "$response_headers" | grep -i "Content-Type" | cut -d' ' -f2- | tr -d '\r')
cache_control=$(echo "$response_headers" | grep -i "Cache-Control" | cut -d' ' -f2- | tr -d '\r')
connection=$(echo "$response_headers" | grep -i "Connection" | cut -d' ' -f2- | tr -d '\r')
no_buffering=$(echo "$response_headers" | grep -i "X-Accel-Buffering" | cut -d' ' -f2- | tr -d '\r')

if [[ "$content_type" == *"text/event-stream"* ]]; then
  echo -e "${GREEN}✓ Content-Type is text/event-stream${NC}"
else
  echo -e "${RED}✗ Content-Type not set to text/event-stream${NC}"
fi

if [[ "$cache_control" == *"no-cache"* ]]; then
  echo -e "${GREEN}✓ Cache-Control includes no-cache${NC}"
else
  echo -e "${RED}✗ Cache-Control missing no-cache${NC}"
fi

if [[ "$connection" == "keep-alive" ]]; then
  echo -e "${GREEN}✓ Connection set to keep-alive${NC}"
else
  echo -e "${RED}✗ Connection not set to keep-alive${NC}"
fi

if [[ "$no_buffering" == "no" ]]; then
  echo -e "${GREEN}✓ X-Accel-Buffering set to no${NC}"
else
  echo -e "${RED}✗ X-Accel-Buffering not set to no${NC}"
fi

echo -e "\n${GREEN}CORS Testing Complete${NC}"
