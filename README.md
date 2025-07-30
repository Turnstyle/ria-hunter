# RIA Hunter Backend

A Next.js backend service for processing and querying Registered Investment Adviser (RIA) data using Google Document AI and Vertex AI.

## Features

- **Document AI Ingestion Pipeline**: Automatically fetches and processes SEC Form ADV documents
- **Data Normalization**: Standardizes and validates adviser information
- **RAG API**: Natural language query interface powered by Google Gemini
- **Vector Search** (Optional): Semantic search capabilities using pgvector

## API Endpoints

### `/api/ask` - Natural Language Query Endpoint

Query adviser data using natural language questions.

**Method**: `POST`

**Request Body**:
```json
{
  "query": "What are the largest investment advisers in California?",
  "limit": 5  // Optional, defaults to 5
}
```

**Response**:
```json
{
  "answer": "Based on the data, here are the largest investment advisers in California...",
  "sources": [
    {
      "firm_name": "Example Advisers LLC",
      "crd_number": "123456",
      "city": "San Francisco",
      "state": "CA",
      "aum": 5000000000
    }
  ]
}
```

**Example Queries**:
- "Show me the top advisers in Texas"
- "Which firms have the most employees?"
- "Find investment advisers in New York with over $1 billion AUM"

### Other Endpoints

- `/api/ria-hunter-waitlist` - Waitlist signup
- `/api/save-form-data` - Contact form submission

## Setup

### Prerequisites

- Node.js 18+
- Supabase account
- Google Cloud account with Vertex AI enabled

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Turnstyle/ria-hunter.git
cd ria-hunter
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
```

Edit `.env` with your credentials:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Cloud
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=us-central1
```

4. Run the development server:
```bash
npm run dev
```

## Data Processing

### Document AI Pipeline

Process SEC Form ADV documents:

```bash
# Process a single CIK
npx ts-node src/docai/index.ts 0001234567

# Process multiple CIKs from a file
npx ts-node src/docai/batch.ts path/to/cik-list.txt
```

### Vector Embeddings (Optional)

Generate embeddings for semantic search:

```bash
npx ts-node scripts/embed_narratives.ts
```

**Note**: Requires pgvector extension in Supabase:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Database Schema

The main table `ria_profiles` stores adviser information:

```sql
CREATE TABLE ria_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_name TEXT NOT NULL,
  crd_number TEXT NOT NULL,
  sec_number TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  aum BIGINT,
  employee_count INTEGER,
  narrative_embedding vector(768), -- Optional, for vector search
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

## Architecture

```
ria-hunter/
├── app/api/          # API routes
│   └── ask/          # RAG endpoint
├── src/
│   ├── docai/        # Document AI pipeline
│   └── lib/mapping/  # Field mapping & validation
├── scripts/          # Utility scripts
└── lib/              # Shared utilities
```

## Development

Run tests:
```bash
npm test
```

Build for production:
```bash
npm run build
```

## Deployment

This project is configured for deployment on Vercel. Environment variables must be set in the Vercel dashboard.

## License

[License information here] 