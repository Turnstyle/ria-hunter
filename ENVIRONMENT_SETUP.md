# Environment Setup for RIA Hunter

## Environment Files

The project expects environment variables in `.env.local`. If you already have an `env.local` file with working values, copy it to `.env.local` so Next.js can read it:

```bash
cp env.local .env.local
```

Keep `env.local` around as a backup if you like, but `.env.local` should be the file you edit.

## Required Variables

At minimum the backend needs:

```
SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
GOOGLE_PROJECT_ID=<google-project-id>
GCP_SA_KEY_BASE64=<base64-encoded-service-account-json>
VERTEX_AI_LOCATION=us-central1
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_PRICE_ID=<stripe-price-id>
FRONTEND_URL=https://ria-hunter.app
```

### Vertex AI Credentials

The backend now uses Google Vertex AI exclusively. Provide credentials with one of the following options (in order of preference):

1. `GCP_SA_KEY_BASE64` containing a base64-encoded service account JSON.
2. `GOOGLE_APPLICATION_CREDENTIALS_B64` (legacy base64 field).
3. `GOOGLE_APPLICATION_CREDENTIALS_JSON` containing the raw JSON string.
4. `GOOGLE_APPLICATION_CREDENTIALS` pointing to a local JSON file (development only).

The service account must include `private_key`, `client_email`, and `project_id` fields and have access to Vertex AI.

### Stripe

Confirm `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` match the keys configured in the Stripe Dashboard. `FRONTEND_URL` should point to the domain that handles checkout redirects.

## Verifying Configuration

Run a quick check to confirm the key Vertex variables resolve:

```bash
node -e "console.log({ project: process.env.GOOGLE_PROJECT_ID, hasKey: !!process.env.GCP_SA_KEY_BASE64 })"
```

If you see the expected project and `hasKey: true`, the Vertex configuration is wired correctly.

## Good Practices

- Store secrets only in `.env.local` (do **not** commit this file).
- Keep `env.local` updated if teammates rely on it as a reference, but treat `.env.local` as the source of truth for local development.
- When deploying to Vercel, mirror the same variables in the Vercel dashboard.
