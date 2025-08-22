# RIA Hunter API Documentation

## Overview

This document describes the RIA Hunter API endpoints, authentication mechanisms, and environment configuration. The API provides access to Registered Investment Adviser (RIA) data with natural language query capabilities and structured search options.

## Base URL

- Production: `https://api.ria-hunter.app`
- Development: `http://localhost:3000`

## Authentication

Most endpoints require authentication via a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

Anonymous usage is allowed for some endpoints with rate limits.

### Rate Limits

- **Authenticated Users**: 
  - Free tier: 5 queries per month + 1 bonus query per share (max 5 bonus queries)
  - Subscribers: Unlimited queries

- **Anonymous Users**: 2 queries total

## Endpoints

### Natural Language Query

#### POST `/api/ask`

Query RIA data using natural language.

**Request Body**:
```json
{
  "query": "What are the largest investment advisers in California?",
  "maxResults": 10,
  "includeDetails": true
}
```

**Parameters**:
- `query` (string, required): Natural language question about RIAs
- `maxResults` (number, optional): Maximum number of results to return (default: 10)
- `includeDetails` (boolean, optional): Whether to include detailed information about each RIA (default: true)

**Response**:
```json
{
  "answer": "Based on the data, here are the largest investment advisers in California...",
  "sources": [
    {
      "legal_name": "Example Advisers LLC",
      "crd_number": "123456",
      "city": "San Francisco",
      "state": "CA",
      "aum": 5000000000,
      "vc_fund_count": 3,
      "vc_total_aum": 1500000000,
      "activity_score": 8.5,
      "executives": [
        {"name": "Jane Smith", "title": "CEO"}
      ]
    }
  ],
  "insufficient_data": false,
  "metadata": {
    "maxResults": 10,
    "includeDetails": true,
    "remaining": 4,
    "relaxed": false
  }
}
```

### Structured Search

#### POST `/api/v1/ria/search`

Search RIAs using structured parameters and semantic search.

**Request Body**:
```json
{
  "query": "investment advisors with private funds",
  "state": "CA",
  "useHybridSearch": true,
  "minVcActivity": 1,
  "minAum": 1000000000,
  "limit": 20
}
```

**Parameters**:
- `query` (string, required): Search query
- `state` (string, optional): Filter by state code
- `useHybridSearch` (boolean, optional): Use both semantic and text search (default: false)
- `minVcActivity` (number, optional): Minimum private fund count
- `minAum` (number, optional): Minimum Assets Under Management
- `limit` (number, optional): Maximum number of results (default: 20)

**Response**:
```json
{
  "results": [
    {
      "legal_name": "Example Advisers LLC",
      "crd_number": "123456",
      "city": "San Francisco",
      "state": "CA",
      "aum": 5000000000,
      "executives": [
        { "name": "Jane Smith", "title": "CEO" }
      ]
    }
  ],
  "query": "investment advisors with private funds",
  "total": 1,
  "credits": {
    "remaining": 9,
    "isSubscriber": false
  }
}
```

### Profile Details

#### GET `/api/v1/ria/profile/[cik]`

Get detailed information about a specific RIA by CIK/CRD number.

**Parameters**:
- `cik` (path parameter, required): CIK or CRD number of the RIA

**Response**:
```json
{
  "profile": {
    "legal_name": "Example Advisers LLC",
    "crd_number": "123456",
    "cik": "0001234567",
    "city": "San Francisco",
    "state": "CA",
    "aum": 5000000000,
    "form_adv_date": "2023-03-15T00:00:00.000Z",
    "executives": [
      { "name": "Jane Smith", "title": "CEO" }
    ],
    "funds": [
      {
        "fund_name": "Example Private Fund I",
        "fund_type": "Private Equity",
        "aum": 500000000
      }
    ]
  }
}
```

### Deprecated Endpoints

The following endpoints are deprecated and will return HTTP 410 Gone:

- GET/POST `/api/v1/ria/query` - Use `/api/ask` or `/api/v1/ria/search` instead

## Error Handling

All API errors follow a standard format:

```json
{
  "error": "Error message for the user",
  "code": "ERROR_CODE"
}
```

### Error Codes

- `BAD_REQUEST` (400): Invalid request parameters
- `UNAUTHORIZED` (401): Authentication required
- `PAYMENT_REQUIRED` (402): Rate limit reached or subscription required
- `FORBIDDEN` (403): Access denied
- `NOT_FOUND` (404): Resource not found
- `ENDPOINT_DEPRECATED` (410): The endpoint is no longer supported
- `INTERNAL_ERROR` (500): Server-side error
- `SERVICE_UNAVAILABLE` (503): Service temporarily unavailable

## CORS

The API supports CORS for the following origins:
- `https://ria-hunter.app`
- `https://www.ria-hunter.app`
- `https://ria-hunter-app.vercel.app`
- Any Vercel preview deployments matching `https://ria-hunter-*.vercel.app`

## Environment Variables

The following environment variables are required for deployment:

### Database
- `SUPABASE_URL`: URL of the Supabase instance
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for Supabase admin access
- `NEXT_PUBLIC_SUPABASE_URL`: Public URL for client-side Supabase access
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anonymous key for client-side Supabase access

### AI Provider
- `AI_PROVIDER`: AI provider to use ('openai' or 'vertex')
- `OPENAI_API_KEY`: OpenAI API key (if using OpenAI)
- `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID (if using Vertex AI)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google Cloud credentials (if using Vertex AI)

### CORS
- `CORS_ORIGINS`: Comma-separated list of allowed origins
- `ALLOW_ALL_ORIGINS`: Set to 'true' for development only to allow all origins

### Authentication & Rate Limiting
- `JWT_SECRET`: Secret for JWT verification
- `NEXTAUTH_URL`: URL for NextAuth.js
- `NEXTAUTH_SECRET`: Secret for NextAuth.js

### Stripe (Optional)
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret
- `STRIPE_PRICE_ID`: Stripe price ID for the subscription

### Miscellaneous
- `FRONTEND_URL`: URL of the frontend for redirects
- `NODE_ENV`: Environment ('development', 'production', 'test')
