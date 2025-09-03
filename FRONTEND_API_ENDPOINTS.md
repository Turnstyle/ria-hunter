# Frontend API Endpoints - UPDATED

## ⚠️ IMPORTANT: Stop Using /v1/ Endpoints

The `/api/v1/` endpoints are **DEPRECATED** and should not be used. Use the endpoints listed below instead.

## Correct API Endpoints to Use

### 1. Main AI-Powered Search & Q&A
**Endpoint:** `POST /api/ask`

This is the primary endpoint for natural language queries and AI-powered search.

**Request:**
```json
{
  "query": "What are the ten largest RIA firms in St. Louis?"
}
```

**Response:**
```json
{
  "answer": "Based on the search results, here are the ten largest RIA firms in St. Louis...",
  "results": [...],
  "metadata": {
    "searchStrategy": "semantic-first",
    "confidence": 0.85,
    "totalResults": 10
  },
  "searchesRemaining": 4
}
```

**Features:**
- Uses semantic search with proper embeddings
- Falls back to structured search if needed
- Handles authentication and demo limits
- Returns natural language answers with source data

### 2. Simple Database Search (No AI)
**Endpoint:** `GET /api/ria/search-simple`

For basic text searches without AI processing.

**Query Parameters:**
- `query` - Search text
- `state` - State filter (e.g., "MO")
- `limit` - Number of results (default: 10)

**Example:**
```
GET /api/ria/search-simple?query=investment&state=MO&limit=10
```

### 3. Test AI Search (Development)
**Endpoint:** `POST /api/test-ai-search`

For testing AI search functionality during development.

## ❌ DO NOT USE These Deprecated Endpoints

- `/api/v1/ria/search` - DEPRECATED, use `/api/ask` instead
- `/api/v1/ria/query` - DEPRECATED, use `/api/ask` instead
- `/api/v1/ria/profile/[cik]` - Still functional but consider updating
- `/api/v1/ria/funds/[cik]` - Still functional but consider updating

## Migration Guide

### Old Way (WRONG):
```javascript
// DON'T DO THIS
const response = await fetch('/api/v1/ria/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    query: "largest RIAs in St. Louis",
    useHybridSearch: true 
  })
});
```

### New Way (CORRECT):
```javascript
// DO THIS INSTEAD
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` // if authenticated
  },
  body: JSON.stringify({ 
    query: "What are the ten largest RIA firms in St. Louis?"
  })
});
```

## Authentication

The `/api/ask` endpoint supports both authenticated and anonymous users:
- **Anonymous users**: Get 5 free searches (tracked via cookies)
- **Authenticated users**: Pass JWT token in Authorization header
- **Subscribers**: Unlimited searches

## Response Handling

The new `/api/ask` endpoint returns richer responses:

```javascript
const data = await response.json();

if (response.status === 402) {
  // User hit their limit
  console.log('Searches remaining:', data.searchesRemaining);
  // Show upgrade prompt
}

if (response.ok) {
  // Display the natural language answer
  displayAnswer(data.answer);
  
  // Display the source results
  displayResults(data.results);
  
  // Show remaining searches for demo users
  if (data.searchesRemaining !== undefined) {
    updateSearchCounter(data.searchesRemaining);
  }
}
```

## Environment Configuration

The backend now properly handles `AI_PROVIDER=google` in the environment, which maps to Google Vertex AI for embeddings.

## Questions?

If you need help migrating from v1 endpoints, please coordinate with the backend team.
