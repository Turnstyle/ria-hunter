# Stripe and Database Integration

This document explains how Stripe and the database are integrated in RIA Hunter's billing system.

## Database Schema

The billing system uses the following tables:

### 1. `user_accounts`

Contains user account information, including Stripe customer linkage and subscription status.

```sql
create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,
  is_pro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2. `credit_transactions`

Stores individual credit transactions for users who aren't subscribers.

```sql
create table if not exists public.credit_transactions (
  id bigserial primary key,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  delta integer not null,
  reason text,
  source text,
  created_at timestamptz not null default now()
);
```

### 3. `stripe_events`

Ensures webhook idempotency by tracking processed Stripe events.

```sql
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);
```

## Webhook to Database Mapping

The Stripe webhook handler processes the following events:

1. `customer.subscription.created`
2. `customer.subscription.updated`
3. `customer.subscription.deleted`

When processing these events, the handler:
1. Extracts the customer's email and Stripe IDs
2. Upserts the user into `user_accounts` (using email as the primary key)
3. Updates subscription status and sets `is_pro` flag

### Mapping Subscription Status to `is_pro`

A user is considered a pro subscriber (`is_pro = true`) when:
- The subscription status is one of: `active`, `trialing`, or `past_due`
- AND the subscription is not set to cancel at the end of the period (`cancel_at_period_end = false`)

## Balance Endpoint

The balance endpoint returns the following standardized response:

```json
{
  "credits": <number|null>,
  "balance": <number|null>,
  "isSubscriber": <boolean>,
  "source": "db|cookie|stripe-fallback"
}
```

Where:
- `credits` and `balance` are the same value (for backward compatibility)
- For subscribers, both `credits` and `balance` are `null` to indicate unlimited usage
- `isSubscriber` is `true` for users with an active subscription
- `source` indicates where the data came from:
  - `db`: from the database
  - `cookie`: from the fallback cookie system
  - `stripe-fallback`: from directly querying Stripe (rare)

## Debug Endpoints

### 1. Billing Debug

**Endpoint:** `/_backend/api/billing/debug`

**Authentication:** Requires `Authorization: Bearer ${CREDITS_SECRET}` header

**Query Parameters:**
- `email`: Optional. Email to look up a specific user

**Example Response:**
```json
{
  "ok": true,
  "tables": {
    "user_accounts": true,
    "credit_transactions": true,
    "stripe_events": true
  },
  "sample": {
    "email": "turnerpeters@gmail.com",
    "userAccount": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "turnerpeters@gmail.com",
      "stripe_customer_id": "cus_123456789",
      "stripe_subscription_id": "sub_123456789",
      "subscription_status": "active",
      "is_pro": true,
      "created_at": "2025-08-25T00:00:00.000Z",
      "updated_at": "2025-08-25T00:00:00.000Z"
    },
    "stripeSubscription": {
      "id": "sub_123456789",
      "status": "active",
      "current_period_end": "2025-09-25T00:00:00.000Z",
      "cancel_at_period_end": false,
      "plan": "RIA Hunter Pro",
      "is_active": true
    }
  }
}
```

### 2. DB Sanity Check

**Endpoint:** `/_backend/api/admin/db-sanity`

**Authentication:** Requires `Authorization: Bearer ${CREDITS_SECRET}` header

**Method:** POST

**Example Response:**
```json
{
  "ok": true,
  "created": ["user_accounts", "credit_transactions"],
  "skipped": ["stripe_events"]
}
```

## Stripe Billing Portal

**Endpoint:** `/_backend/api/stripe/portal`

**Authentication:** Requires authenticated user (uses Supabase Auth)

**Method:** POST

**Example Response:**
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

## Acceptance Checks

To verify the integration is working correctly:

1. **Check if required tables exist:**
   ```
   GET /_backend/api/billing/debug
   ```
   Should return `"tables":{"user_accounts":true,"credit_transactions":true,"stripe_events":true}`

2. **Verify webhook idempotency:**
   Sending the same Stripe event twice should return `200 OK` with `{"ok":true,"duplicate":true}` on the second attempt.

3. **Check user record in Supabase:**
   Execute in Supabase SQL Editor:
   ```sql
   select id,email,stripe_customer_id,stripe_subscription_id,subscription_status,is_pro,updated_at
   from user_accounts
   where email = 'turnerpeters@gmail.com';
   ```
   Should return one row with `is_pro = true` for a subscribed user.

4. **Verify balance endpoint:**
   For a signed-in subscriber, the response should be:
   ```json
   {
     "credits": null,
     "balance": null,
     "isSubscriber": true,
     "source": "db"
   }
   ```

## Bootstrap Process

To initialize the database schema:
1. Make a POST request to `/_backend/api/admin/db-sanity` with the `Authorization: Bearer ${CREDITS_SECRET}` header
2. This will create any missing tables needed for the billing system
3. The endpoint will return which tables were created and which already existed
