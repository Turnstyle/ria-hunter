# Stripe Webhooks Integration Guide

This document describes how the Stripe webhook integration works in the RIA Hunter application.

## Endpoint URLs

- Production endpoint: `https://ria-hunter.app/_backend/api/stripe-webhook`
- Legacy alias: `https://ria-hunter.app/api/stripe-webhook` (redirects to the main endpoint)

## Required Environment Variables

For proper operation, the following environment variables must be set in Vercel:

- `STRIPE_SECRET_KEY` - Your Stripe secret key (starts with `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET` - The webhook signing secret (starts with `whsec_...`)
- `SUPABASE_URL` - URL of your Supabase instance
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (not anon key)
- `NEXT_PUBLIC_APP_URL` - Set to `https://ria-hunter.app`
- `CREDITS_SECRET` - Strong random secret (≥32 bytes)
- `WELCOME_CREDITS` - Default: 15

## Webhook Events Handled

The webhook handler processes the following Stripe events:

1. `customer.subscription.created` - When a new subscription is created
2. `customer.subscription.updated` - When a subscription is updated (renewal, plan change, etc.)
3. `customer.subscription.deleted` - When a subscription is canceled
4. `checkout.session.completed` - When a checkout session completes

## Resending Events from Stripe

To resend a webhook event from Stripe:

1. Log in to the [Stripe Dashboard](https://dashboard.stripe.com/)
2. Go to Developers → Webhooks
3. Select your webhook endpoint
4. Click on "Recent events" tab
5. Find the event you want to resend and click "Resend"

For testing, you can also use the [Stripe CLI](https://stripe.com/docs/stripe-cli) or the [Stripe Webhook Tester](https://dashboard.stripe.com/test/webhooks/create) in test mode.

## Vercel Logs

To check for webhook processing in Vercel logs:

1. Log in to the [Vercel Dashboard](https://vercel.com/)
2. Select the "ria-hunter" project
3. Go to "Deployments" → select the latest production deployment
4. Click on "Functions" tab
5. Look for `/_backend/api/stripe-webhook` function
6. Check logs for entries with:
   - `stripe_webhook_event` - Successful event processing
   - `stripe_webhook_signature_error` - Signature verification failed
   - `stripe_webhook_processing_error` - Error during processing
   - `billing_link_error` or `billing_update_error` - Errors in the billing functions

## Troubleshooting

If Stripe shows a delivery error:

### 400 Bad Request
- **Problem**: Signature mismatch or missing signature header
- **Check**: Verify the `STRIPE_WEBHOOK_SECRET` is correctly set in Vercel
- **Check**: Ensure the webhook was created with the correct URL

### 500 Server Error
- **Problem**: Internal server error during webhook processing
- **Check**: Open Vercel logs and look for `stripe_webhook_processing_error`
- **Check**: Ensure Supabase environment variables are correctly set
- **Check**: Verify the service-role key (not anon key) is being used
- **Check**: Look for errors in DB operations or business logic

### Subscription Status Not Updating
- **Problem**: User still appears as "Free" even after subscribing
- **Check**: Check the user's row in the `user_accounts` table
- **Check**: Verify `stripe_customer_id` is correctly linked
- **Check**: Look for errors in webhook handling

## Debug Endpoint

For a quick diagnostic check of the webhook environment, use:

```
curl -H "Authorization: Bearer YOUR_CREDITS_SECRET" https://ria-hunter.app/_backend/api/credits/debug
```

This will return the status of all required environment variables and verify database connectivity.

## Implementation Details

The webhook implementation follows these key principles:

1. **Signature Verification** - All webhooks verify the Stripe signature using the raw request body
2. **Reliable Error Handling** - Always returns 200 OK to Stripe after receipt (even if processing fails)
3. **Idempotent Processing** - Can handle repeated delivery of the same event
4. **Secure Logging** - Avoids logging sensitive information while providing useful diagnostic data
5. **Customer Linkage** - Attempts to link Stripe customers to user accounts through various identifiers

For any questions or issues, contact the development team.
