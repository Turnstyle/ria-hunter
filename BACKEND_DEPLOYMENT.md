# RIA Hunter Backend Deployment

This document provides instructions for deploying the RIA Hunter backend components. Follow these steps in order to set up the database, load data, generate embeddings, and deploy the API.

## Prerequisites

Make sure you have the following:

1. Supabase account with access to the project at `https://llusjnpltqxhokycwzry.supabase.co`
2. Supabase service role key and anon key
3. Node.js and npm installed
4. Vercel CLI installed (`npm install -g vercel`)
5. Access to Google Cloud for Vertex AI

## Step 1: Environment Setup

Create a `.env.local` file in the project root with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Google Cloud Configuration (for Vertex AI)
GOOGLE_PROJECT_ID=ria-hunter-backend
GCP_SA_KEY_BASE64=your-base64-encoded-service-account-json
VERTEX_AI_LOCATION=us-central1

# Stripe Configuration
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
STRIPE_PRICE_ID=your-stripe-price-id

# Application URL
NEXT_PUBLIC_APP_URL=https://ria-hunter.app

# CORS Configuration
CORS_ORIGINS=https://ria-hunter.app,https://ria-hunter-app.vercel.app
```

## Step 2: Database Migrations

1. Apply missing migrations:

```bash
npx supabase migration up
```

If the Supabase CLI doesn't work directly, you can apply the migration manually using the Supabase SQL editor with the contents of `scripts/apply_missing_migration.sql`.

## Step 3: Data Loading and Embedding

Run the combined data loading and embedding script:

```bash
# Install dependencies
npm install

# Run the data pipeline
npx tsx scripts/load_and_embed_data.ts
```

This script performs the following steps:
- Loads RIA profiles from CSV
- Inserts profiles into the `ria_profiles` table
- Generates narratives and stores them in the `narratives` table
- Creates embeddings for all narratives

You can optionally set `LOAD_LIMIT=100` in your environment to test with a smaller dataset first.

## Step 4: Apply Hybrid Search Function

Apply the hybrid search function to the database:

```bash
# Connect to Supabase
npx supabase db query -f scripts/implement_hybrid_search.sql
```

Or manually run the SQL in the Supabase SQL editor.

## Step 5: Deploy the API

Deploy the application to Vercel:

```bash
# Login to Vercel
vercel login

# Link to the correct project
vercel link

# Deploy to production
vercel --prod
```

Make sure to set all environment variables in the Vercel project settings.

## Step 6: Verify Deployment

Test the deployed API endpoints:

1. `/api/v1/ria/search` - Test with a search query
2. `/api/ask` - Test the RAG question answering endpoint
3. `/api/v1/ria/profile/[cik]` - Test profile retrieval

## Troubleshooting

If you encounter issues:

1. **Database connection errors**: Verify the Supabase URL and service role key
2. **AI provider errors**: Confirm that Google Cloud credentials are present and valid (GOOGLE_PROJECT_ID, GCP_SA_KEY_BASE64, VERTEX_AI_LOCATION)
3. **Missing tables**: Verify that all migrations were applied successfully
4. **CORS errors**: Make sure the CORS_ORIGINS environment variable includes all necessary domains

## Maintenance

- Monitor the database for any performance issues
- Update embeddings periodically if new data is added
- Check logs in Vercel for any API errors

For any questions or issues, please contact the development team.
