# Stripe Integration Setup

## Required Environment Variables

For the Stripe integration to work properly, the following environment variables must be set in both Production and Preview environments:

```
STRIPE_SECRET_KEY=sk_live_...        # Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...       # From Stripe Dashboard > Developers > Webhooks
SUPABASE_URL=https://...              # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciO...# Supabase service role key
CREDITS_SECRET=...                    # Secret for credits system (server only)
WELCOME_CREDITS=15                    # Number of credits for new users
```

## Verification Steps

1. **Deploy** the application to Vercel.

2. **Verify Webhook Setup**:
   - Go to Stripe Dashboard > Developers > Webhooks
   - Confirm Endpoint URL is `https://ria-hunter.app/_backend/api/stripe-webhook`
   - Use Interactive webhook endpoint builder with "Use signing secret" enabled
   - Send a test `customer.subscription.updated` with a real subscription ID
   - Expect HTTP 200 response and webhook event logs in Vercel

3. **Verify Anonymous Credits**:
   - Open app in incognito browser
   - Header should show 15 credits (cookie fallback)

4. **Verify Subscriber Status**:
   - Log in with an account that has an active subscription
   - Header/Usage pages should show "Pro" status and correct credits

## Troubleshooting

- **Webhook failing:** Check Vercel logs for `[webhook]` entries
- **Missing subscriber status:** Verify user has `is_subscriber: true` in `user_accounts` table
- **No credits showing:** Check if balance endpoint is returning proper format with both `balance` and `credits` fields
