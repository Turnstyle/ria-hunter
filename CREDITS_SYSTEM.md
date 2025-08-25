# RIA Hunter Credits System

This document describes the credits system implementation for RIA Hunter.

## Overview

The credits system is a flexible way to manage user access to API endpoints, using a balance-based approach where users can earn, purchase, or be granted credits.

## Database Schema

### Tables

1. **user_accounts**
   - Stores the user's current credit balance
   - Primary key: `user_id` (text)
   - Fields:
     - `balance` (integer): Current credit balance
     - `created_at` (timestamptz): When the account was created
     - `updated_at` (timestamptz): When the account was last updated

2. **credit_transactions**
   - Records all credit transactions (additions and deductions)
   - Primary key: `id` (UUID)
   - Fields:
     - `user_id` (text): Foreign key to user_accounts
     - `amount` (integer): Transaction amount (positive for additions, negative for deductions)
     - `balance_after` (integer): Balance after the transaction
     - `source` (text): Source of the transaction ('purchase', 'grant', 'migration', 'share', 'subscription')
     - `idempotency_key` (text, unique): For preventing duplicate transactions
     - `ref_type` (text): Reference type ('welcome', 'monthly', 'purchase', 'share', 'promo')
     - `ref_id` (text): Reference ID
     - `metadata` (jsonb): Additional metadata
     - `created_at` (timestamptz): When the transaction occurred

### Database Functions

1. **add_credits**
   - Adds credits to a user account
   - Parameters:
     - `p_user_id`: User ID
     - `p_amount`: Amount to add
     - `p_source`: Source of credits
     - `p_idempotency_key`: Optional idempotency key
     - `p_ref_type`: Optional reference type
     - `p_ref_id`: Optional reference ID
     - `p_metadata`: Optional metadata

2. **deduct_credits**
   - Deducts credits from a user account
   - Parameters: Same as add_credits
   - Will fail if the user has insufficient balance

## API Usage

### Balance Route

The `/api/balance` endpoint provides information about a user's current credit balance and optionally grants welcome credits.

#### GET `/api/balance`

Returns the user's current balance.

**Response:**
```json
{
  "balance": 15
}
```

## Credits Configuration

Default credit values are configured in `app/config/credits.ts`:

- `ANONYMOUS_FREE_CREDITS`: 15 (default free credits for anonymous users)
- `FREE_USER_MONTHLY_CREDITS`: 15 (default monthly credits for free users)

## Implementation

To use the credits system in your code:

```typescript
import { ensureAccount, getBalance, grantCredits, deductCredits } from '@/lib/credits';

// Ensure a user account exists
await ensureAccount(userId);

// Get the current balance
const balance = await getBalance(userId);

// Grant credits
await grantCredits({
  userId,
  amount: 10,
  source: 'grant',
  idempotencyKey: `monthly:${userId}:${new Date().toISOString().slice(0, 7)}`, 
  refType: 'monthly',
  refId: 'v1',
});

// Deduct credits
const success = await deductCredits({
  userId,
  amount: 1,
  source: 'subscription',
  idempotencyKey: `query:${queryId}`,
  refType: 'query',
  refId: queryId,
});

if (!success) {
  // Handle insufficient credits
}
```

## Deployment

The credits system is deployed as part of the RIA Hunter application. The database schema is managed through Supabase migrations.
