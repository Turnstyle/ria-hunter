# RIA Hunter BACKEND Directory List - 26 August 2025 9:15am

This document provides a comprehensive directory structure of the RIA Hunter project to help AI agents understand the project organization and file locations.

## Project Root Structure

The project is organized into the following main directories:

- `app/` - Next.js application code including frontend and backend API routes
- `lib/` - Shared library code used across the application
- `public/` - Static files served directly by the web server
- `scripts/` - Utility scripts for database management, ETL processes, and testing
- `seed/` - Seed data and scripts for database initialization
- `src/` - Source code for core functionality and tests
- `styles/` - Global CSS styles
- `supabase/` - Supabase database migrations and configurations
- `tests/` - Test scripts and test data
- `Docs/` - Documentation files
- Various configuration and documentation files in the root directory

## Backend API Routes

### Primary Backend API Routes (`app/_backend/api/`)

These are the main backend API routes handling server-side functionality:

- `app/_backend/api/admin/db-sanity/route.ts` - Admin endpoint to check and ensure DB schema integrity
- `app/_backend/api/balance/route.ts` - Retrieves user credit balance and subscription status
- `app/_backend/api/billing/debug/route.ts` - Debug endpoint for billing system
- `app/_backend/api/credits/balance/route.ts` - Credits balance endpoint
- `app/_backend/api/credits/debug/route.ts` - Debug endpoint for credits system
- `app/_backend/api/dev/backfill-user-account/route.ts` - Development utility to backfill user accounts
- `app/_backend/api/stripe-webhook/route.ts` - Stripe webhook handler for subscription events
- `app/_backend/api/stripe/portal/route.ts` - Endpoint to redirect to Stripe billing portal

### Other API Routes (`app/api/`)

- `app/api/ask-stream/route.ts` - Streaming API for AI queries
- `app/api/ask/route.ts` - Non-streaming API for AI queries
- `app/api/ask/context-builder.ts` - Builds context for AI queries
- `app/api/ask/generator.ts` - Generates responses for AI queries
- `app/api/ask/planner.ts` - Plans execution of AI queries
- `app/api/ask/retriever.ts` - Retrieves relevant data for AI queries
- `app/api/balance/route.ts` - Legacy endpoint for credit balance
- `app/api/create-checkout-session/route.ts` - Creates Stripe checkout sessions
- `app/api/credits/balance/route.ts` - Legacy endpoint for credits balance
- `app/api/credits/debug/route.ts` - Legacy debug endpoint for credits
- `app/api/db-check/route.ts` - Database connectivity check endpoint
- `app/api/redeem-share/route.ts` - Endpoint for redeeming shared links
- `app/api/ria-hunter-waitlist/route.ts` - Waitlist signup endpoint
- `app/api/ria/search-simple/route.ts` - Simple RIA search endpoint
- `app/api/save-form-data/route.ts` - Endpoint to save form submissions
- `app/api/stripe-webhook/route.ts` - Legacy Stripe webhook handler
- `app/api/subscription-status/route.ts` - Endpoint to check subscription status
- `app/api/test-embedding/route.ts` - Test endpoint for embeddings

### V1 API Routes for RIA Data

- `app/api/v1/ria/funds/[cik]/route.ts` - API for funds data by CIK
- `app/api/v1/ria/funds/summary/[cik]/route.ts` - API for funds summary by CIK
- `app/api/v1/ria/profile/[cik]/route.ts` - API for RIA profile by CIK
- `app/api/v1/ria/query/route.ts` - API for querying RIA data
- `app/api/v1/ria/search/route.ts` - API for searching RIAs

### Debug API Routes

- `app/api/debug/check-profiles/route.ts` - Debug endpoint to check RIA profiles
- `app/api/debug/database-info/route.ts` - Debug endpoint for database information
- `app/api/debug/health/route.ts` - Health check endpoint
- `app/api/debug/profile-test/route.ts` - Test endpoint for profiles
- `app/api/debug/query-test-simple/route.ts` - Simple query test endpoint
- `app/api/debug/query-test/route.ts` - Query test endpoint
- `app/api/debug/test-29880/route.ts` - Specific test endpoint

## Library Files (`lib/`)

Core utility functions and services:

- `lib/ai-providers.ts` - Configuration for AI providers
- `lib/auth.ts` - Authentication utilities
- `lib/billing.ts` - Billing utilities
- `lib/cors.ts` - CORS handling utilities
- `lib/credits.ts` - Credits system utilities
- `lib/error.ts` - Error handling utilities
- `lib/states.ts` - US states data and utilities
- `lib/supabaseAdmin.ts` - Supabase admin client
- `lib/supabaseClient.ts` - Supabase client for frontend
- `lib/utils.ts` - General utility functions

## Database Migrations (`supabase/migrations/`)

Key database migration files:

- `supabase/migrations/2025-08-25_credits_and_accounts.sql` - Credits and user accounts tables
- `supabase/migrations/20250825_update_stripe_events.sql` - Updates to Stripe events table
- `supabase/migrations/20250825112812_add_credits_system.sql` - Credits system implementation
- `supabase/migrations/20250825120000_add_stripe_events_processed.sql` - Stripe events processing table
- `supabase/migrations/20250804194421_create_ria_tables.sql` - Core RIA data tables
- `supabase/migrations/20250805000000_add_vector_similarity_search.sql` - Vector search functionality
- `supabase/migrations/20250805100000_add_auth_and_subscription_tables.sql` - Auth and subscription tables
- `supabase/migrations/20250824000000_create_hnsw_index.sql` - HNSW index for vector search

## Documentation Files (in `Docs/`)

Important documentation files:

- `Docs/STRIPE_DB_WIRING.md` - Stripe integration with database
- `Docs/stripe-webhooks.md` - Stripe webhooks documentation
- `Docs/Hardening_for_Master_AI_Agent_25th_August_2025.md` - Recent hardening implementation
- `Docs/Final_Refactor_Backend_Plan_v2_22-Aug-2025.md` - Backend refactoring plan

## Root Documentation Files

- `README_BACKEND.md` - Backend documentation
- `README_STRIPE_INTEGRATION.md` - Stripe integration documentation
- `CREDITS_SYSTEM.md` - Credits system documentation
- `BACKEND_DEPLOYMENT.md` - Backend deployment instructions
- `DEPLOY_INSTRUCTIONS.md` - General deployment instructions

## Scripts

Important scripts for database and ETL operations:

- `scripts/add_credits_system.sql` - SQL for credits system
- `scripts/embed_narratives_*.ts` - Various scripts for embedding narratives
- `scripts/fix_narrative_constraints.js` - Fixes narrative constraints
- `scripts/setup_embeddings.sql` - SQL for setting up embeddings
- `scripts/setup_pgvector.js` - Sets up pgvector extension
- `scripts/setup_vector_search.ts` - Sets up vector search functionality

## Testing Files

- `src/__tests__/` - Core functionality tests
- `tests/` - Additional test files

## ETL and Data Processing

- `scripts/etl_narrative_generator.js` - Generates narratives from raw data
- `scripts/check_ria_profiles_schema_quick.js` - Quick schema check for RIA profiles
- `scripts/load_ria_profiles_*.ts` - Scripts to load RIA profile data

## Configuration Files

- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `next.config.mjs` - Next.js configuration
- `vercel.json` - Vercel deployment configuration

This directory structure provides a comprehensive view of the RIA Hunter project, focusing on backend components, API routes, database migrations, and utility scripts that form the backbone of the application.
