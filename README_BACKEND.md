# RIA Hunter Backend Implementation

This document provides instructions for setting up and running the backend components of the RIA Hunter project. The backend is responsible for database management, data ingestion, vector embeddings, and API endpoints.

## Database Setup

We use Supabase for the database. The database is already set up at:
- URL: `https://llusjnpltqxhokycwzry.supabase.co`

### Tables Created

The following tables have been created:

1. **ria_profiles**: Stores main information about RIA firms
   - Primary information about registered investment advisers
   - Includes: name, SEC number, location, AUM, employee count, etc.

2. **narratives**: Stores text descriptions and vector embeddings
   - Text narratives summarizing each RIA
   - Vector embeddings (768-dimension) for semantic search with Vertex AI

3. **control_persons**: Stores executive and owner information
   - Names, positions, and ownership percentages
   - Relationship to parent RIA

4. **ria_private_funds**: Stores information about private funds offered
   - Fund names, types, and AUM
   - Relationship to parent RIA

### Vector Search Setup

The database uses pgvector with HNSW indexes for fast vector similarity search. We've created the following functions for searching:

1. `match_narratives`: Base vector similarity search
2. `search_rias`: Enhanced search with filtering
3. `hybrid_search_rias`: Combines vector and text search
4. `compute_vc_activity`: Helper for ranking VC activity
5. `get_firm_executives`: Retrieve executives for a firm
6. `get_firm_private_funds`: Retrieve funds for a firm

## Scripts

The following scripts have been implemented:

### Data Loading

- `scripts/load_sample_data.py`: Loads sample RIA data for development
  - Usage: `python3 scripts/load_sample_data.py <SUPABASE_SERVICE_ROLE_KEY> [count]`
  - Creates sample RIA profiles, executives, funds, and narratives

### Embedding Generation

- `scripts/embed_narratives_sample.py`: Generates embeddings for narratives
  - Usage: `python3 scripts/embed_narratives_sample.py <SUPABASE_SERVICE_ROLE_KEY> [batch_size]`
  - Uses Vertex AI (with mock mode available for local testing)

## API Endpoints

The following API endpoints have been implemented:

### `/api/v1/ria/query`

- **Method**: GET
- **Description**: Searches for RIA profiles using semantic and/or hybrid search
- **Parameters**:
  - `query` (required): The search query
  - `state`: Filter by state
  - `minAum`: Minimum assets under management
  - `minVcActivity`: Minimum VC activity score
  - `limit`: Maximum results to return (default: 20)
  - `offset`: Pagination offset
  - `hybrid`: Whether to use hybrid search (vector + text)
- **Response**: JSON object with matching RIA profiles, executives, and funds

## Environment Setup

The following environment variables need to be set:

```
SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-key>
GOOGLE_PROJECT_ID=ria-hunter-backend
GCP_SA_KEY_BASE64=<base64-encoded-service-account-json>
VERTEX_AI_LOCATION=us-central1
```

## Running the Backend

1. **Setup dependencies**:
   ```
   npm install
   pip install python-dotenv supabase rich
   ```

2. **Load sample data**:
   ```
   python3 scripts/load_sample_data.py <SUPABASE_SERVICE_ROLE_KEY> 50
   ```

3. **Generate embeddings**:
   ```
   python3 scripts/embed_narratives_sample.py <SUPABASE_SERVICE_ROLE_KEY>
   ```

4. **Run the Next.js development server**:
   ```
   npm run dev
   ```

5. **Test the API**:
   ```
   curl "http://localhost:3000/api/v1/ria/query?query=Top%20investment%20advisers%20in%20Missouri%20with%20venture%20capital%20activity"
   ```

## Deployment

Deploy to Vercel with:

```
vercel --prod
```

Ensure all necessary environment variables are set in the Vercel project settings.

## Next Steps

With the backend implementation complete, the focus now shifts to the frontend implementation, which will build a user interface for the RAG search functionality.

## Authentication

The backend issues passwordless emails through Supabase Magic Links.

- `POST /api/auth/magic-link` – accepts `{ email, redirectTo? }` and sends the OTP email via Supabase.
- `POST /api/auth/sync` – accepts the Supabase access token in the `Authorization` header and ensures the `user_accounts` row exists/updates metadata.

Both routes run with the Node.js runtime and expect Supabase environment variables outlined in `ENVIRONMENT_SETUP.md`.
