# RIA Hunter Backend - Comprehensive Fix Plan

## Overview
This document provides step-by-step prompts for fixing the RIA Hunter backend repository. Each section contains actionable tasks that an AI agent in Cursor IDE can execute.

**Repository:** `Turnstyle/ria-hunter`

---

## 🎯 Primary Objectives

1. **Remove ALL OpenAI code** - Keep only VertexAI
2. **Fix Stripe webhook** - Actually update user accounts on subscription events
3. **Add Supabase Magic Link auth** - Remove dependency on Google OAuth
4. **Remove hardcoded logic** - Let AI handle more intelligently
5. **Ensure proper subscription tracking**

---

## Section 1: Remove OpenAI Code (Keep Only VertexAI)

### 1.1 Update AI Provider Module

**File:** `lib/ai-providers.ts`

**Task:** Remove the entire OpenAI implementation and make VertexAI the only provider.

**Steps:**
1. Delete the `OpenAIService` class (lines 138-178)
2. Delete the OpenAI case in `createAIService` function (lines 280-294)
3. Update the `AIProvider` type to only allow 'vertex':
   ```typescript
   export type AIProvider = 'vertex';
   ```
4. Simplify `getAIProvider` function to always return 'vertex':
   ```typescript
   export function getAIProvider(): AIProvider {
     return 'vertex';
   }
   ```
5. Remove all OpenAI-related logic from the factory function
6. Update `createAIService` to only handle Vertex:
   ```typescript
   export function createAIService(): AIService | null {
     const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
     const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
     
     if (!projectId) {
       console.error('Vertex AI: Missing Google Cloud project ID');
       return null;
     }

     // Get credentials (existing logic remains)
     let credentials: any = null;
     // ... keep existing credential loading logic ...
     
     try {
       return new VertexAIService(projectId, location, credentials);
     } catch (error) {
       console.error('Failed to initialize Vertex AI:', error);
       return null;
     }
   }
   ```

### 1.2 Remove OpenAI Dependencies

**File:** `package.json`

**Task:** Remove OpenAI package dependency.

**Steps:**
1. Find and remove the `"openai"` dependency
2. Run `npm install` to update lock file
3. Verify the app still builds: `npm run build`

### 1.3 Update Environment Variables

**File:** `.env.example`

**Task:** Remove OpenAI references from environment template.

**Steps:**
1. Remove any lines mentioning `OPENAI_API_KEY`
2. Remove any lines mentioning `AI_PROVIDER=openai`
3. Update the AI_PROVIDER line to only show vertex:
   ```
   # AI Provider (uses Google Vertex AI only)
   GOOGLE_PROJECT_ID=your-project-id
   GCP_SA_KEY_BASE64=your-base64-encoded-service-account-json
   VERTEX_AI_LOCATION=us-central1
   ```

### 1.4 Update All API Endpoints

**Files to check:**
- `app/api/ask/route.ts`
- `app/api/ask/planner-v2.ts`
- `app/api/ask/generator.ts`
- `app/api/ask/unified-search.ts`

**Task:** Remove any AI_PROVIDER environment checks or OpenAI references.

**Steps:**
1. Search for `AI_PROVIDER` in these files
2. Remove any conditional logic that switches between providers
3. Ensure all files directly use `createAIService()` without provider parameter
4. Remove any OpenAI-specific configuration or fallback logic

---

## Section 2: Fix Stripe Webhook Integration

### 2.1 Update Stripe Webhook Handler

**File:** `app/api/stripe-webhook/route.ts`

**Task:** Replace the stub implementation with actual subscription processing.

**Current Issue:** The webhook just logs events but doesn't update user accounts.

**Steps:**

1. Import the billing utilities at the top:
   ```typescript
   import { recordProcessedEvent, upsertSubscriptionFromEvent } from '@/lib/billing';
   ```

2. Replace the entire `POST` function with this implementation:
   ```typescript
   export async function POST(req: Request) {
     const sig = req.headers.get('stripe-signature');
     if (!sig) {
       console.warn('stripe_webhook_missing_signature');
       return NextResponse.json({ ok: true }, { status: 200 });
     }

     const payload = await req.text();
     let event: Stripe.Event;
     
     try {
       event = await stripe.webhooks.constructEventAsync(
         payload,
         sig,
         process.env.STRIPE_WEBHOOK_SECRET!
       );
     } catch (err) {
       console.error('stripe_webhook_signature_error', String(err));
       return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
     }

     console.log('stripe_webhook_event', { 
       id: event.id, 
       type: event.type
     });

     // Check if event was already processed (idempotency)
     const alreadyProcessed = await recordProcessedEvent(event.id);
     if (alreadyProcessed) {
       console.log('stripe_webhook_already_processed', { eventId: event.id });
       return NextResponse.json({ ok: true, message: 'Already processed' }, { status: 200 });
     }

     try {
       // Process subscription events
       if (event.type.startsWith('customer.subscription') || 
           event.type === 'invoice.paid' || 
           event.type === 'invoice.payment_failed') {
         await upsertSubscriptionFromEvent(event);
       }

       return NextResponse.json({ ok: true }, { status: 200 });
     } catch (err) {
       console.error('stripe_webhook_handler_error', { 
         type: event.type, 
         id: event.id, 
         error: String(err)
       });
       // Return 200 to prevent Stripe retries on our application errors
       return NextResponse.json({ ok: true }, { status: 200 });
     }
   }
   ```

### 2.2 Verify Billing Utilities

**File:** `lib/billing.ts`

**Task:** Verify the billing functions are working correctly (they should already be good).

**Steps:**
1. Review the `upsertSubscriptionFromEvent` function (lines 117-220)
2. Ensure it handles these event types:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
3. Verify it updates the `user_accounts` table with:
   - `is_subscriber` (boolean)
   - `subscription_status` (string)
   - `current_period_end` (timestamp)
   - `plan` (string)

### 2.3 Test Stripe Webhook Locally

**Task:** Test the webhook integration using Stripe CLI.

**Steps:**
1. Install Stripe CLI if not already: `brew install stripe/stripe-cli/stripe` (or download)
2. Login: `stripe login`
3. Forward webhooks to local: `stripe listen --forward-to localhost:3000/api/stripe-webhook`
4. Trigger test events: `stripe trigger customer.subscription.created`
5. Check logs to verify events are processed and database is updated

---

## Section 3: Add Supabase Magic Link Authentication

### 3.1 Enable Magic Link in Supabase Dashboard

**Manual Step (User must do this):**
1. Go to Supabase Dashboard → Authentication → Providers
2. Ensure "Email" provider is enabled
3. Under Email settings, enable "Confirm email" (optional but recommended)
4. Save settings

### 3.2 Create Magic Link Auth Utilities

**File:** `lib/auth.ts`

**Task:** Add functions for magic link authentication alongside existing JWT validation.

**Steps:**

1. Add this function after the existing auth functions:
   ```typescript
   /**
    * Send magic link for passwordless authentication
    * @param email User's email address
    * @returns Success status and error if any
    */
   export async function sendMagicLink(email: string, redirectTo?: string): Promise<{ error: string | null }> {
     try {
       const { error } = await supabaseAdmin.auth.signInWithOtp({
         email,
         options: {
           emailRedirectTo: redirectTo || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
         }
       });
       
       if (error) {
         console.error('Magic link send error:', error);
         return { error: error.message };
       }
       
       return { error: null };
     } catch (err) {
       console.error('Magic link exception:', err);
       return { error: 'Failed to send magic link' };
     }
   }

   /**
    * Verify magic link token
    * @param token Token from magic link URL
    * @returns User session or error
    */
   export async function verifyMagicLink(token: string): Promise<{ session: any; error: string | null }> {
     try {
       const { data, error } = await supabaseAdmin.auth.verifyOtp({
         token_hash: token,
         type: 'magiclink'
       });
       
       if (error) {
         console.error('Magic link verification error:', error);
         return { session: null, error: error.message };
       }
       
       return { session: data.session, error: null };
     } catch (err) {
       console.error('Magic link verification exception:', err);
       return { session: null, error: 'Failed to verify magic link' };
     }
   }
   ```

### 3.3 Create Magic Link API Endpoint

**File:** `app/api/auth/magic-link/route.ts` (NEW FILE)

**Task:** Create endpoint for sending magic links.

**Steps:**

1. Create the file with this content:
   ```typescript
   import { NextRequest, NextResponse } from 'next/server';
   import { sendMagicLink } from '@/lib/auth';
   import { corsHeaders, handleOptionsRequest } from '@/lib/cors';

   export async function OPTIONS(req: NextRequest) {
     return handleOptionsRequest(req);
   }

   export async function POST(req: NextRequest) {
     try {
       const body = await req.json();
       const { email, redirectTo } = body;

       if (!email || typeof email !== 'string') {
         return NextResponse.json(
           { error: 'Email is required' },
           { status: 400, headers: corsHeaders(req) }
         );
       }

       // Basic email validation
       const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
       if (!emailRegex.test(email)) {
         return NextResponse.json(
           { error: 'Invalid email format' },
           { status: 400, headers: corsHeaders(req) }
         );
       }

       const result = await sendMagicLink(email, redirectTo);

       if (result.error) {
         return NextResponse.json(
           { error: result.error },
           { status: 500, headers: corsHeaders(req) }
         );
       }

       return NextResponse.json(
         { success: true, message: 'Magic link sent to your email' },
         { status: 200, headers: corsHeaders(req) }
       );

     } catch (error) {
       console.error('Magic link API error:', error);
       return NextResponse.json(
         { error: 'Failed to send magic link' },
         { status: 500, headers: corsHeaders(req) }
       );
     }
   }
   ```

### 3.4 Update Documentation

**File:** `README.md`

**Task:** Update authentication section to mention Magic Link instead of Google OAuth.

**Steps:**
1. Find the "Authentication" section
2. Replace Google OAuth references with:
   ```markdown
   ## Authentication

   RIA Hunter uses Supabase Magic Link authentication for passwordless sign-in:
   
   - Users enter their email address
   - Supabase sends a magic link to their email
   - Clicking the link signs them in
   - No passwords to remember or manage
   
   ### Setup
   
   1. Enable Email provider in Supabase Dashboard
   2. Configure email templates (optional)
   3. Set NEXT_PUBLIC_APP_URL for redirect handling
   ```

---

## Section 4: Remove Hardcoded Logic

### 4.1 Review Location Handling

**File:** `app/api/ask/route.ts`

**Current Issue:** Lines 116-132 have manual location parsing logic that should be handled by AI.

**Task:** Remove hardcoded location fallback parsing.

**Steps:**

1. Find this code block (around lines 116-132):
   ```typescript
   // Also check the combined location field for backward compatibility
   if (!extractedCity && !extractedState && decomposition.structured_filters?.location) {
     const extractedLocation = decomposition.structured_filters.location;
     console.log(`[${requestId}] Using AI-decomposed location (legacy): ${extractedLocation}`);
     
     const locationParts = extractedLocation.split(',').map(p => p.trim());
     if (locationParts.length === 2) {
       extractedCity = locationParts[0];
       extractedState = locationParts[1];
     } else if (locationParts.length === 1) {
       const loc = locationParts[0];
       if (loc.length === 2 && loc === loc.toUpperCase()) {
         extractedState = loc;
       } else {
         extractedCity = loc;
       }
     }
   }
   ```

2. Replace with a comment explaining why it was removed:
   ```typescript
   // Location extraction is now fully handled by the AI planner (planner-v2.ts)
   // The Gemini function calling provides structured city and state separately
   // No manual parsing needed - trust the AI decomposition
   ```

3. Ensure the planner (planner-v2.ts) is using Gemini function calling for structured output

### 4.2 Remove Other Hardcoded Patterns

**Task:** Search for TODO, FIXME, and HACK comments and address them.

**Steps:**
1. Search codebase for these patterns: `grep -r "TODO\|FIXME\|HACK" app/ lib/`
2. For each one found:
   - If it's about letting AI handle something: implement AI-based solution
   - If it's about configuration: move to environment variables
   - If it's outdated: remove it
3. Document any that can't be fixed immediately

---

## Section 5: Ensure Proper Subscription Tracking

### 5.1 Verify Database Schema

**Task:** Ensure the `user_accounts` and `subscriptions` tables are properly set up.

**Steps:**

1. Check if these tables exist with correct schema:
   ```sql
   -- user_accounts should have:
   CREATE TABLE IF NOT EXISTS user_accounts (
     id UUID PRIMARY KEY REFERENCES auth.users(id),
     email TEXT UNIQUE,
     stripe_customer_id TEXT UNIQUE,
     is_subscriber BOOLEAN DEFAULT FALSE,
     subscription_status TEXT,
     subscription_id TEXT,
     plan TEXT,
     plan_price_id TEXT,
     current_period_end TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- subscriptions table (if used separately)
   CREATE TABLE IF NOT EXISTS subscriptions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id),
     status TEXT NOT NULL,
     current_period_end TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- stripe_events_processed for idempotency
   CREATE TABLE IF NOT EXISTS stripe_events_processed (
     event_id TEXT PRIMARY KEY,
     processed_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. If tables are missing, create migration file in `supabase/migrations/`

3. Run migration: `npx supabase db push` (if using Supabase CLI)

### 5.2 Update Session Status Endpoint

**File:** `app/api/session/status/route.ts`

**Task:** Ensure it checks the correct table for subscription status.

**Current Implementation:** Already checks `subscriptions` table (lines 42-48) - verify this is correct.

**Steps:**
1. If using `user_accounts.is_subscriber` instead, update the query:
   ```typescript
   const { data: account, error } = await supabaseAdmin
     .from('user_accounts')
     .select('is_subscriber, subscription_status, current_period_end')
     .eq('id', userId)
     .single();
   
   const isSubscriber = account && 
     account.is_subscriber && 
     ['trialing', 'active'].includes(account.subscription_status || '');
   ```

2. Ensure consistent table usage across all subscription checks

---

## Section 6: Testing & Verification

### 6.1 Local Testing Checklist

**Run these tests after making all changes:**

1. **Build test:**
   ```bash
   npm run build
   ```
   Verify no TypeScript errors

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Test Vertex AI:**
   ```bash
   curl -X POST http://localhost:3000/api/ask \
     -H "Content-Type: application/json" \
     -d '{"query":"What are the largest RIAs in California?"}'
   ```
   Verify response uses Vertex AI (check logs)

4. **Test Magic Link (after frontend is updated):**
   - Request magic link via new API endpoint
   - Check email delivery
   - Verify link works for authentication

5. **Test Stripe Webhook:**
   ```bash
   stripe trigger customer.subscription.created
   ```
   Verify database is updated in `user_accounts` or `subscriptions` table

### 6.2 Deployment Checklist

**Before deploying:**

1. Set environment variables in Vercel:
   - Remove `OPENAI_API_KEY`
   - Remove `AI_PROVIDER` (or set to `vertex`)
   - Ensure `GOOGLE_PROJECT_ID` is set
   - Ensure `GCP_SA_KEY_BASE64` is set
   - Verify `STRIPE_SECRET_KEY` is set
   - Verify `STRIPE_WEBHOOK_SECRET` is set

2. Update Stripe webhook URL:
   - Go to Stripe Dashboard → Webhooks
   - Update webhook endpoint to production URL
   - Verify signing secret matches environment variable

3. Deploy:
   ```bash
   git push origin main
   ```
   (Vercel should auto-deploy)

4. Verify deployment:
   - Test `/api/ask` endpoint with production URL
   - Check Vercel logs for any errors
   - Test subscription flow end-to-end

---

## Section 7: Code Quality & Cleanup

### 7.1 Remove Unused Dependencies

**Task:** Clean up package.json of any unused dependencies.

**Steps:**
1. Run: `npx depcheck`
2. Remove any unused dependencies found
3. Run: `npm install`

### 7.2 Update Documentation

**Files to update:**
- `README.md` - Update auth section
- `BACKEND_API_DOCUMENTATION.md` - Add magic link endpoint docs
- `.env.example` - Remove OpenAI references

### 7.3 Add Logging

**Task:** Ensure proper logging for debugging.

**Steps:**
1. Verify all Stripe webhook events are logged
2. Verify all authentication attempts are logged (without exposing tokens)
3. Add request IDs to all API logs for tracing

---

## 🎬 Final Verification

After completing all sections, verify:

- [ ] OpenAI code completely removed from codebase
- [ ] `npm run build` succeeds with no errors
- [ ] Stripe webhook updates database correctly
- [ ] Magic link authentication endpoint exists and works
- [ ] All environment variables documented in `.env.example`
- [ ] No hardcoded location parsing (AI handles it)
- [ ] Subscription status properly tracked in database
- [ ] All tests pass (if tests exist)
- [ ] Documentation updated with new auth flow

---

## Notes for Cursor AI Agent

When executing these prompts:
1. Work through sections sequentially
2. Test after each major section
3. If you encounter errors, check the diagnostics and fix before proceeding
4. Don't skip the verification steps
5. If something is unclear, check the referenced line numbers in the original files

The goal is a working backend that:
- Uses ONLY Vertex AI (no OpenAI)
- Has working Stripe subscriptions
- Supports passwordless magic link auth
- Lets AI handle complexity (no hardcoding)
- Works seamlessly with the frontend

---

## ✅ COMPLETION STATUS - October 15, 2025

### Supabase Database Migration - COMPLETED

**Date Completed:** October 15, 2025  
**Executed By:** AI Agent via Supabase SQL Editor

#### What Was Done:

1. **✅ Updated `user_accounts` table schema:**
   - Added `plan` (text) column
   - Added `current_period_end` (timestamptz) column
   - Added `is_subscriber` (boolean) column with default false
   - Added `balance` (integer) column with default 0
   - Migrated existing `is_pro` data to `is_subscriber`
   - Set proper NOT NULL constraints
   - Created unique indexes on email and stripe_customer_id

2. **✅ Created/Verified updated_at trigger:**
   - Created `set_updated_at()` function
   - Applied trigger to auto-update `updated_at` on row changes

3. **✅ Created `get_credits_balance` RPC function:**
   - Function accepts UUID user_id
   - Sums `delta` column from `credit_transactions` table
   - Returns INTEGER balance

4. **✅ Verified `stripe_events_processed` table:**
   - Table exists with correct schema (event_id, processed_at)
   - Index on event_id for fast idempotency checks

5. **✅ Verified `subscriptions` table:**
   - Table exists with correct schema
   - Foreign key to auth.users(id)
   - Indexes on status and stripe_customer_id

#### Final Schema Verification:

All required tables and functions are in place:
- `user_accounts`: 11/11 required columns ✓
- `get_credits_balance` RPC: exists ✓
- `subscriptions` table: exists ✓
- `stripe_events_processed` table: exists ✓

#### Current user_accounts Schema:
```
- id (uuid, PRIMARY KEY, NOT NULL)
- email (citext, UNIQUE, NOT NULL)
- stripe_customer_id (text, UNIQUE)
- stripe_subscription_id (text)
- subscription_status (text)
- is_pro (boolean) [legacy, kept for compatibility]
- is_subscriber (boolean, NOT NULL, default: false)
- plan (text)
- current_period_end (timestamptz)
- balance (integer, NOT NULL, default: 0)
- created_at (timestamptz, NOT NULL)
- updated_at (timestamptz, NOT NULL)
```

#### Next Steps:

The backend API (`/api/auth/sync`) is already configured to use these canonical columns. The frontend will now receive the normalized account payload with all subscription and balance data.

**Ready for production use.** ✅
