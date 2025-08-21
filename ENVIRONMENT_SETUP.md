# Environment Setup for RIA Hunter

## Environment Files Explained

There are multiple environment files in the project, which can be confusing:

1. `.env.example` - An example template that shows what variables are needed
2. `.env.local` - The main environment file used by Next.js/Vercel locally
3. `env.local` - A file that appears to contain actual configuration values

## What to Do With These Files

You should use `.env.local` (with the dot at the beginning) as your main environment file. Based on what I can see, your current `.env.local` is minimal, while the `env.local` (without the dot) contains all the necessary values.

## Step 1: Copy Environment Variables

**Copy the contents from `env.local` to `.env.local`**

You can do this by running:

```bash
cp env.local .env.local
```

## Step 2: Edit the AI Provider Setting

Since you mentioned that Vercel is configured to use Vertex AI, you should change the AI provider setting in `.env.local`:

Find this section:
```
# AI Provider Configuration
# Options: 'vertex' (Google Vertex AI) or 'openai' (OpenAI)
# Default: openai (due to current Vertex AI billing limitations)
AI_PROVIDER=openai
```

Change it to:
```
# AI Provider Configuration
# Options: 'vertex' (Google Vertex AI) or 'openai' (OpenAI)
AI_PROVIDER=vertex
```

This will make your local environment match what's configured in Vercel.

## Step 3: Update Frontend URL if Needed

If you're deploying to a specific URL, update the Frontend URL:

```
# ---- Frontend URL for Stripe redirects ----
FRONTEND_URL=https://ria-hunter.app
```

Change it to your actual deployed frontend URL. If you're testing locally, leave it as `http://localhost:3000`.

## Environment Variables Explained

Here's what each variable is for:

### Supabase Configuration
- `SUPABASE_URL` - The URL of your Supabase project (already correct)
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key for Supabase (already correct)
- `NEXT_PUBLIC_SUPABASE_URL` - Same as SUPABASE_URL, but available to the client (already correct)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public key for Supabase (already correct)

### Google Cloud Configuration
- `GOOGLE_CLOUD_PROJECT` - Your Google Cloud project ID (already correct)
- `GOOGLE_PROJECT_ID` - Same as above (already correct)
- `DOCUMENT_AI_PROCESSOR_ID` - ID for Document AI processor (already correct)
- `DOCUMENT_AI_PROCESSOR_LOCATION` - Region for Document AI (already correct)
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to your Google Cloud credentials file (already correct)

### SEC API Configuration
- `SEC_API_KEY` - API key for SEC data (already correct)
- `SEC_API_BASE_URL` - Base URL for SEC API (already correct)

### AI Configuration
- `OPENAI_API_KEY` - API key for OpenAI (already correct)
- `AI_PROVIDER` - **Change this to "vertex"** to match Vercel settings

### Stripe Configuration
- `STRIPE_SECRET_KEY` - Secret key for Stripe payments (already correct)
- `STRIPE_WEBHOOK_SECRET` - Secret for verifying Stripe webhooks (already correct)
- `STRIPE_PRICE_ID` - ID for your Stripe product pricing (already correct)

### Frontend URL
- `FRONTEND_URL` - URL for redirects after Stripe payments (update if needed)

## Verifying Environment Variables

After updating `.env.local`, you can run the following command to verify that Node.js can read your environment variables:

```bash
node -e "console.log('AI Provider:', process.env.AI_PROVIDER)"
```

If set up correctly, this should print "AI Provider: vertex".

## Important Notes

1. **The Keys Are Correct**: As you mentioned, all the API keys and credentials in `env.local` are correct and functional. You don't need to get new keys from Google Cloud or Supabase.

2. **AI Provider Setting**: The main change needed is to set `AI_PROVIDER=vertex` to match what's configured in Vercel.

3. **File with Dot**: In Node.js/Next.js projects, environment files should start with a dot (`.env.local`), not just `env.local`. That's why we need to copy the contents to the correct file.
