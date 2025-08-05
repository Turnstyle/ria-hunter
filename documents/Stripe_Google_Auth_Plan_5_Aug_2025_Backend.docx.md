# Implementation Plan – RIA Hunter **Backend** (Turnstyle/ria-hunter)

## Setup Steps & Dependencies

* **Install Required Packages:** Add the Stripe Node.js SDK and update Supabase libraries if needed. In the backend project directory, run:

* npm install stripe @supabase/supabase-js

* Ensure @supabase/supabase-js is v2+ (for methods like supabase.auth.getUser).

* **Environment Variables:** Update the backend’s .env file to include keys for Supabase and Stripe. For example, in .env (or Vercel Dashboard for production):

* \# Supabase (existing)  
  SUPABASE\_URL=\<your\_supabase\_project\_url\>  
  SUPABASE\_SERVICE\_ROLE\_KEY=\<your\_supabase\_service\_key\>  \# for admin access  
  \# (Keep NEXT\_PUBLIC\_SUPABASE\_URL and NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY if used in backend)

  \# Google OAuth (Supabase handles client ID/secret in dashboard; no new env needed here)  
  \# Stripe API keys  
  STRIPE\_SECRET\_KEY=\<your\_stripe\_secret\_key\>  
  STRIPE\_WEBHOOK\_SECRET=\<your\_stripe\_webhook\_signing\_secret\>  
  \# (Optional) Price ID for the subscription plan  
  STRIPE\_PRICE\_ID=\<price\_id\_for\_$20\_monthly\_plan\>

* **Supabase Service Role Key:** Ensure you have the service role key set for server-side Supabase client actions that bypass RLS (used to log queries, handle webhooks, etc.). This key should be kept secret (never exposed to frontend).

* **Stripe Keys:** Obtain the secret API key from the Stripe Dashboard (Developers \-\> API Keys) and your webhook signing secret (from Developers \-\> Webhooks after creating an endpoint). The STRIPE\_PRICE\_ID corresponds to the $20/month price with free trial (see Stripe setup below).

* **Supabase Configuration:** In your Supabase project, enable Google as an external OAuth provider. In Supabase Dashboard under **Authentication \-\> Providers**, enter the Google **Client ID** and **Secret** obtained from Google Cloud Console[\[1\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=Supabase%20dashboard,Provider%20section%20to%20display%20it). (You’ll need to set up a Google OAuth Consent Screen and OAuth Client; see Supabase docs for the required authorized redirect URI and domains[\[2\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=5.%20Click%20,OAuth%20Client%20ID)[\[3\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=9,section%20of%20the%20Supabase%20Dashboard).)

* **Database Setup:** Create new tables in Supabase to track usage and subscriptions:

* **user\_queries table** – logs each query a user makes.

* **user\_shares table** – logs when a user redeems a LinkedIn share bonus.

* **subscriptions table** – tracks subscription status per user.

For example, you can execute SQL in Supabase (or via migration script):

\-- Table to log each query usage  
CREATE TABLE IF NOT EXISTS user\_queries (  
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),  
    user\_id UUID REFERENCES auth.users NOT NULL,  
    created\_at TIMESTAMP WITH TIME ZONE DEFAULT now()  
);  
\-- Table to log share-for-credit events  
CREATE TABLE IF NOT EXISTS user\_shares (  
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),  
    user\_id UUID REFERENCES auth.users NOT NULL,  
    shared\_at TIMESTAMP WITH TIME ZONE DEFAULT now()  
);  
\-- Table to track Stripe subscription status  
CREATE TABLE IF NOT EXISTS subscriptions (  
    user\_id UUID PRIMARY KEY REFERENCES auth.users,  
    stripe\_customer\_id TEXT,  
    stripe\_subscription\_id TEXT,  
    status TEXT,       \-- e.g. 'trialing', 'active', 'canceled'  
    current\_period\_end TIMESTAMP WITH TIME ZONE,  
    updated\_at TIMESTAMP WITH TIME ZONE DEFAULT now()  
);

Add appropriate indexes (e.g. index user\_queries.user\_id, created\_at for efficient counting per month). If using Supabase Row-Level Security, define policies so that users can only see their own records in these tables if needed. (For instance, allow SELECT on user\_queries where user\_id \= auth.uid() to let the frontend query usage count if desired.)

* **Stripe Setup:** In the Stripe Dashboard, create a Product and a Price for the subscription:

* **Product:** “RIA Hunter Pro Plan” (for example).

* **Price:** $20.00 monthly recurring. Enable a trial period of 7 days. (**Note:** Stripe allows setting trial via API. E.g., you can pass trial\_period\_days: 7 when creating the Checkout Session[\[4\]](https://docs.stripe.com/payments/checkout/free-trials#:~:text=You%20can%20configure%20a%20Checkout,one%20of%20the%20following%20parameters), or configure the price with a trial through Stripe’s API if needed.)

* Get the Price ID (e.g. price\_12345) and set STRIPE\_PRICE\_ID.

* **Webhook:** Add a webhook endpoint in Stripe pointing to your backend (e.g. https://\<your-domain\>/api/stripe-webhook) and subscribe to relevant events (checkout session completions, subscription status changes, payments). Copy the webhook signing secret to STRIPE\_WEBHOOK\_SECRET.

## Google OAuth with Supabase (Authentication Flow)

**Enable Google Sign-In via Supabase:** With the Google provider configured in Supabase, the backend leverages Supabase Auth to handle the OAuth flow. Supabase will manage the OAuth callback and token exchange. No custom OAuth callbacks are needed in the backend API – Supabase redirects the user back to the frontend with a session token after Google login is completed.

**Session Verification on Backend:** Replace the existing Auth0 JWT verification in the middleware with Supabase JWT verification logic: \- **Next.js Middleware:** Modify middleware.ts to accept Supabase Auth tokens. The frontend will include the Supabase access token in each request’s Authorization header (Bearer \<jwt\>). The middleware should: 1\. Check for Authorization header and extract the token. 2\. Use Supabase to validate the token and get the user identity. For example, use the service role client to call supabase.auth.getUser(token) – this hits Supabase Auth API to verify the JWT and retrieve the user[\[5\]](https://supabase.com/docs/guides/auth/server-side/nextjs#:~:text=Always%20use%20,pages%20and%20user%20data). This ensures the token is valid and not expired[\[5\]](https://supabase.com/docs/guides/auth/server-side/nextjs#:~:text=Always%20use%20,pages%20and%20user%20data). 3\. If the token is invalid or missing, return an HTTP 401 response; if valid, allow the request to proceed.

\<details\>\<summary\>**Example: Updated Middleware (pseudo-code)**\</summary\>

// import supabase admin client using service role key  
import { createClient } from '@supabase/supabase-js';  
const supabaseAdmin \= createClient(process.env.SUPABASE\_URL\!, process.env.SUPABASE\_SERVICE\_ROLE\_KEY\!);

export async function middleware(request: NextRequest) {  
  const authHeader \= request.headers.get('Authorization');  
  if (\!authHeader?.startsWith('Bearer ')) {  
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
  }  
  const token \= authHeader.split(' ')\[1\];  
  // Validate JWT with Supabase  
  const { data: user, error } \= await supabaseAdmin.auth.getUser(token);  
  if (error || \!user) {  
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });  
  }  
  // (Optionally attach user info to request for later use)  
  return NextResponse.next();  
}

export const config \= { matcher: \['/api/:path\*'\] };

\</details\>

* **Remove Auth0-specific code:** Eliminate Auth0 JWKS fetching and token verification logic. The Supabase JWT will be automatically verified by getUser(), so Auth0 audience/issuer checks are no longer needed. Also update environment configs (you can remove AUTH0\_\* vars if not used elsewhere).

**How it integrates:** After this change, all protected API routes will require a valid Supabase session token. The frontend initiates Google login via Supabase (see frontend plan), and upon return, the user’s Supabase session token will be used on each API call. The backend now trusts Supabase for user identity. This lays the groundwork for using auth.uid() in Supabase RLS policies (if any) and for tying usage and subscription records to user\_id. By using supabase.auth.getUser() on each request, the backend ensures the user is authenticated for sensitive operations[\[5\]](https://supabase.com/docs/guides/auth/server-side/nextjs#:~:text=Always%20use%20,pages%20and%20user%20data).

## Query Limit Enforcement (Free Tier Usage Limits)

We will implement server-side checks to restrict API usage to 2 queries per user per month (with a possible bonus \+1 as described). This involves tracking usage in the database and checking before processing a query.

**1\. Track Query Usage:**  
Use the user\_queries table to log each query invocation: \- Each time a user hits the query endpoint (/api/ask), insert a record with their user\_id and timestamp. Because this is a serverless function, use the Supabase **service role** client (admin privileges) to insert the record (ensuring it succeeds regardless of RLS). Example using Supabase Node client:

await supabaseAdmin.from('user\_queries').insert({ user\_id: user.id });

This log will be used to count how many queries a user has made.

**2\. Enforce Limit in API:**  
Augment the /api/ask route handler to enforce limits: \- **Retrieve User:** Identify the user making the request. In the middleware above we validated the token; we can either pass the user info via request headers/context or simply call supabase.auth.getUser() again in the handler using the token (or use the user ID from middleware if attached). \- **Calculate Current Usage:** Query the user\_queries table for count of queries this user made in the current month. For example:

const startOfMonth \= new Date();  
startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);  
const { count: queryCount } \= await supabaseAdmin  
  .from('user\_queries')  
  .select('\*', { head: true, count: 'exact' })  
  .eq('user\_id', user.id)  
  .gte('created\_at', startOfMonth);

Do a similar count on user\_shares to see if the user has a share bonus in this month:

const { count: shareCount } \= await supabaseAdmin  
  .from('user\_shares')  
  .select('\*', { head: true, count: 'exact' })  
  .eq('user\_id', user.id)  
  .gte('shared\_at', startOfMonth);

Calculate the allowed free queries as **2 \+ min(shareCount, 1\)** (at most one bonus per month). \- **Check Subscription:** (See Stripe integration below) If the user has an active subscription (Pro plan), they should be exempt from the free tier limit. You can check the subscriptions table for an entry with this user. For example:

const { data: sub } \= await supabaseAdmin  
  .from('subscriptions')  
  .select('status')  
  .eq('user\_id', user.id)  
  .single();  
const isSubscriber \= sub && \['trialing','active'\].includes(sub.status);

If isSubscriber \== true, skip the usage limit check (unlimited queries for paid users). \- **Enforce or Reject:** If user is not a subscriber and queryCount \>= 2 (or \>=3 if they have a share bonus logged): \- Do NOT process the query. Return a response indicating the limit is reached. For example:

return NextResponse.json({  
  error: "Free query limit reached for this month. Share on LinkedIn for \+1 or upgrade to Pro."  
}, { status: 403 });

\- **(Optional)** You might include in the response how many queries remain or a flag so the frontend can prompt the user accordingly. \- If under the limit (or a subscriber), allow the query to be processed as normal: \- Execute the search/AI answer logic (as already implemented in /api/ask). \- After obtaining the answer (just before returning the success response), log the usage: insert a new row into user\_queries for this user (so the count is updated). This ensures the current request counts toward their quota.

**3\. Bonus Credit via LinkedIn Share:**  
Implement an endpoint to handle the "+1 if shared on LinkedIn" bonus: \- **API Route:** Create a new endpoint (e.g. POST /api/redeem-share or /api/bonus/share). This route requires authentication (include it in middleware protection) since it modifies the user’s allowance. \- **Logic:** When the user triggers a LinkedIn share from the frontend (see frontend plan), the frontend can call this endpoint to claim the bonus. \- In the handler, check if the user already has a share bonus logged for the current month. Query user\_shares similarly to above. If a record exists for this month, you may refuse a second bonus:

const existing \= await supabaseAdmin  
  .from('user\_shares')  
  .select('id')  
  .eq('user\_id', user.id)  
  .gte('shared\_at', startOfMonth);  
if (existing.data?.length) {  
  return NextResponse.json({ error: 'Share bonus already used this month' }, { status: 400 });  
}

\- If not used yet, insert a new row into user\_shares for this user:

await supabaseAdmin.from('user\_shares').insert({ user\_id: user.id });

\- You might respond with the updated allowance (e.g. “bonus granted” message or new total allowed queries). \- **LinkedIn Share Verification:** Full verification of a LinkedIn share is non-trivial (would require LinkedIn’s API and the user’s LinkedIn OAuth). For simplicity, treat the act of hitting the share button as intent. The frontend will open the LinkedIn share URL and call this endpoint. We assume honest usage – the one-time endpoint call awards \+1. (If needed, you could require the user to confirm they shared by providing a link or screenshot, but that’s beyond scope.)

**Integration points:** The backend’s enforcement works in tandem with the frontend: \- The **frontend** will receive a 403 error if the user hits the limit; it should then prompt the user to either share or upgrade. The backend message can guide the UI. \- The **share bonus endpoint** allows the frontend to grant the user one extra query. After a successful response from this endpoint, the frontend can inform the user that their query limit increased by one. The next call to /api/ask will see the updated user\_shares count and allow one extra query. \- This system ensures that even if a user tries to bypass the UI (e.g. calling the API directly), the server-side limit is authoritative. All usage is tied to the authenticated user\_id, leveraging Supabase Auth. By counting only current-month entries (using a date filter like \>= first\_of\_month), the limit resets each month automatically without needing a cron job.

**Documentation Reference:** Supabase’s JWT validation (supabase.auth.getUser) ensures only valid sessions access the API[\[5\]](https://supabase.com/docs/guides/auth/server-side/nextjs#:~:text=Always%20use%20,pages%20and%20user%20data), and we leverage that user identity to enforce per-user limits.

## Stripe Subscription Integration (Paid Plan with Trial)

The paid subscription feature provides unlimited queries. We will integrate Stripe Checkout for subscriptions and handle post-checkout events via webhooks to upgrade or downgrade users in our system.

**1\. Checkout Session Creation (Server-side):**  
Implement an API route (e.g. POST /api/create-checkout-session) that creates a Stripe Checkout Session for the subscription: \- **Endpoint Security:** Protect this route with auth (middleware) — only logged-in users should initiate checkout. \- **Stripe Initialization:** At the top of the module, initialize the Stripe client:

import Stripe from 'stripe';  
const stripe \= new Stripe(process.env.STRIPE\_SECRET\_KEY\!, { apiVersion: '2022-11-15' });

\- **Retrieve User Info:** Determine the current user’s Supabase user.id and email. The email will be passed to Stripe to pre-fill the Checkout and associate with the Customer. \- **Create Session:** Use stripe.checkout.sessions.create with mode "subscription". Provide the price ID and a 7-day trial:

const session \= await stripe.checkout.sessions.create({  
  mode: 'subscription',  
  payment\_method\_types: \['card'\],  // ensure card payments  
  customer\_email: user.email,      // use Supabase-auth email for consistency  
  line\_items: \[  
    { price: process.env.STRIPE\_PRICE\_ID, quantity: 1 }  
  \],  
  subscription\_data: { trial\_period\_days: 7 },  // 7-day free trial\[4\]  
  client\_reference\_id: user.id,  // pass Supabase user ID for webhook reconciliation  
  success\_url: \`${FRONTEND\_URL}/subscription/success?session\_id={CHECKOUT\_SESSION\_ID}\`,  
  cancel\_url: \`${FRONTEND\_URL}/subscription/cancel\`  
});  
return NextResponse.json({ id: session.id, url: session.url });

\- **Trial Period:** We specify trial\_period\_days: 7 here[\[4\]](https://docs.stripe.com/payments/checkout/free-trials#:~:text=You%20can%20configure%20a%20Checkout,one%20of%20the%20following%20parameters), so Stripe will start the subscription in a trialing state (no charge upfront, invoice generated at trial end). \- **Client Reference:** We attach the Supabase user.id in client\_reference\_id. This will come back in webhook events, allowing us to link the Stripe session/customer to our user[\[6\]](https://docs.stripe.com/api/checkout/sessions/create?lang=cli#:~:text=client%20_%20reference%20_%20id,string). \- **Success/Cancel URLs:** These point to frontend routes. On success, Stripe will redirect the user to a confirmation page in our app (we’ll handle that on the frontend). The session ID is included in the URL for potential client-side post-processing (though in our case we’ll mainly rely on webhooks for final confirmation). \- The API responds with the session id and/or the url. The frontend will use this to redirect the user to Stripe Checkout (see frontend section for details).

**2\. Stripe Webhook Handling (Server-side):**  
Create a serverless function at /api/stripe-webhook to receive Stripe’s event notifications. This route will update the Supabase database based on subscription status changes. \- **Endpoint Setup:** Mark this route to **disable body parsing**, since Stripe requires the raw request body for signature verification. In Next.js App Router, you can use request.text() or request.arrayBuffer() to get raw data. Example in an **Edge**/Node context: \<details\>\<summary\>Webhook Handler Example (TypeScript)\</summary\>

\`\`\`ts  
import { NextRequest, NextResponse } from 'next/server';  
import Stripe from 'stripe';  
const stripe \= new Stripe(process.env.STRIPE\_SECRET\_KEY\!, { apiVersion: '2022-11-15' });  
export async function POST(request: NextRequest) {  
  const sig \= request.headers.get('stripe-signature');  
  const body \= await request.text();  // raw body as string  
  let event: Stripe.Event;  
  try {  
    event \= stripe.webhooks.constructEvent(body, sig\!, process.env.STRIPE\_WEBHOOK\_SECRET\!);  
  } catch (err) {  
    console.error('❗️ Stripe webhook signature verification failed.', err.message);  
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 });  
  }  
  // Handle the event  
  const data \= event.data.object as Stripe.Checkout.Session | Stripe.Subscription | Stripe.Invoice;  
  let userId: string | null \= null;  
  switch (event.type) {  
    case 'checkout.session.completed':  
      // Subscription checkout completed (subscription is created in Stripe)  
      const session \= data as Stripe.Checkout.Session;  
      userId \= session.client\_reference\_id || null;  
      if (userId && session.subscription) {  
        const subId \= session.subscription.toString();  
        const cusId \= session.customer?.toString();  
        await supabaseAdmin.from('subscriptions').upsert({  
          user\_id: userId,  
          stripe\_customer\_id: cusId,  
          stripe\_subscription\_id: subId,  
          status: 'trialing'  // immediately after checkout, will be 'trialing'  
        });  
      }  
      break;  
    case 'customer.subscription.created':  
      // A new subscription object was created (alternative entry point – after trial start)  
      const sub \= data as Stripe.Subscription;  
      userId \= sub.metadata?.user\_id || null;  
      // (Alternatively, store userId in subscription metadata in createSession)  
      if (userId) {  
        await supabaseAdmin.from('subscriptions').upsert({  
          user\_id: userId,  
          stripe\_customer\_id: sub.customer.toString(),  
          stripe\_subscription\_id: sub.id,  
          status: sub.status  // e.g. 'trialing' or 'active'  
        });  
      }  
      break;  
    case 'customer.subscription.updated':  
      const updatedSub \= data as Stripe.Subscription;  
      userId \= updatedSub.metadata?.user\_id || null;  
      if (userId) {  
        // Update status (e.g., trial \-\> active, or other changes)  
        await supabaseAdmin.from('subscriptions').update({  
          status: updatedSub.status,  
          current\_period\_end: new Date(updatedSub.current\_period\_end \* 1000\)  
        }).eq('user\_id', userId);  
      }  
      break;  
    case 'customer.subscription.deleted':  
      // Subscription cancelled or expired after trial/payment failure  
      const canceledSub \= data as Stripe.Subscription;  
      userId \= canceledSub.metadata?.user\_id || null;  
      if (userId) {  
        await supabaseAdmin.from('subscriptions').update({  
          status: 'canceled'  
        }).eq('user\_id', userId);  
      }  
      break;  
    default:  
      console.log(\`Unhandled Stripe event type: ${event.type}\`);  
  }  
  return NextResponse.json({ received: true }, { status: 200 });  
}  
\`\`\`  
\</details\>

* **Event Types to Handle:** At minimum, handle:

  * checkout.session.completed – occurs when the user successfully checks out. This contains the client\_reference\_id (our userId) and the subscription ID. Use it to mark the user as having an active subscription. (The subscription status at this moment will typically be trialing, since we set a trial.) Insert or update the subscriptions table for this user: save the Stripe customer\_id, subscription\_id, and status.  
    (*Note:* We use upsert so that if the user upgrades again or the record exists, it updates. Alternatively, since user\_id is primary key, you can do an insert ... on conflict do update.)

  * customer.subscription.created – Stripe may send this when the subscription is first created (redundant to checkout session event). It includes the subscription object. We can similarly upsert the record. (We might leverage metadata to carry user\_id as well – another approach is setting metadata: {user\_id: \<id\>} when creating the session’s subscription\_data, which could help if client\_reference\_id isn’t present in some events.)

  * customer.subscription.updated – sent on changes to the subscription (e.g., trial \-\> active after 7 days, plan changes, renewal, etc.)[\[7\]](https://docs.stripe.com/billing/subscriptions/webhooks#:~:text=,this%20event%2C%20you%20can%20provision). On trial end, for example, the status will transition from trialing to active (if payment succeeded) or to past\_due/canceled if payment failed. Update the status and maybe current\_period\_end in our DB. If status becomes active, the user remains with full access. If it becomes past\_due or canceled, you might choose to treat as canceled (perhaps wait for ...deleted event).

  * customer.subscription.deleted – sent when the subscription is canceled or ends[\[8\]](https://docs.stripe.com/billing/subscriptions/webhooks#:~:text=,Invoicing%20won%E2%80%99t). This is critical for downgrades: when received, update our subscriptions table to mark the user as canceled (and thus return them to free tier limits). We might keep the record but set status: 'canceled' (or remove it entirely). In our check logic, any status that is not active/trialing will be treated as no active subscription.

* **Security:** Verify the webhook signature using Stripe’s library as shown. This ensures the request is genuinely from Stripe. Use the STRIPE\_WEBHOOK\_SECRET from env.

* **Testing:** It’s wise to test this webhook locally using the Stripe CLI (forward events to your dev server) to ensure the events are handled and the DB updates correctly.

**3\. Integrate with Query Limit Logic:**  
With the subscriptions table being updated by webhooks, our query limit check (from the previous section) will consult this table. If a user’s subscription status is trialing or active, the backend will not enforce the 2/month limit. Thus, once a user subscribes (or even during their trial), they can make unlimited queries: \- When a subscription **starts** (user in trial/paid), the webhook sets status='trialing' or 'active'. The next time the user calls /api/ask, isSubscriber will be true, and the limit check is bypassed. \- If a subscription **ends** (canceled or trial expired without payment), the webhook marks status='canceled'. The user’s subsequent API calls will find isSubscriber=false and fall back to free limits (likely they already used their free queries, so the next call would get a 403 until a new month or share bonus).

**4\. Confirming Subscription on Frontend:**  
The backend changes alone grant the user unlimited access, but we should inform the frontend. The Stripe checkout redirect will land the user on a success page – at that point, the webhook may or may not have fired yet. We can do a couple of things: \- On the success page load, fetch the user’s subscription status from our API or Supabase. For example, call an endpoint like /api/get-subscription-status or use Supabase client to select from subscriptions where user\_id \= auth.uid(). If status is trialing or active, you know the user is now Pro. \- Alternatively, the frontend can poll or retry if status isn’t updated immediately. In practice, checkout.session.completed and customer.subscription.created events are near-instant, so by the time the user is back to the app, the subscriptions table should be updated. A simple page reload or status check can confirm. \- Once confirmed, update the UI (e.g. show “Pro” badge, remove any “upgrade” call-to-actions, and do not show query counts).

**Documentation Reference:** We used Stripe’s recommended approach for free trials by specifying subscription\_data.trial\_period\_days in the Checkout Session[\[4\]](https://docs.stripe.com/payments/checkout/free-trials#:~:text=You%20can%20configure%20a%20Checkout,one%20of%20the%20following%20parameters). We also rely on webhook events like customer.subscription.created and ...deleted to sync subscription state[\[8\]](https://docs.stripe.com/billing/subscriptions/webhooks#:~:text=,Invoicing%20won%E2%80%99t). Stripe documentation notes that a new subscription triggers a customer.subscription.created and related events[\[9\]](https://docs.stripe.com/api/events#:~:text=triggers%20a%20,event), and we’ve built handlers for those to update our system.

**5\. Stripe Webhook – Additional Considerations:**  
\- *Idempotency:* Ensure the webhook handler is idempotent. Stripe may retry events. Our use of upsert or update by user\_id helps – multiple receives of the same event will just overwrite the same row without duplicating. \- *Payment failures:* If a trial ends and the charge fails, Stripe will send invoice.payment\_failed and eventually customer.subscription.deleted (if the subscription is canceled for non-payment). We should handle payment\_failed if we want to notify the user, but in terms of access, the deleted event will downgrade them. You can extend the webhook handler to catch invoice.payment\_failed and mark subscription as past\_due or warn the user via email (optional). \- *Plan changes:* Since we have only one plan, we don’t handle upgrade/downgrade flows beyond cancel. If in future multiple plans, customer.subscription.updated would handle plan changes as well (adjust status or features accordingly).

By integrating Stripe in this way, the backend ensures a seamless transition from free to paid: \- **Before subscription:** subscriptions has no entry (user treated as free, limited by server checks). \- **After starting trial/subscribe:** Webhook creates an entry with trial status; server checks now treat user as subscriber (no limits). \- **After cancel/expire:** Webhook updates status to canceled; server re-imposes free limits from that point on.

---

[\[1\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=Supabase%20dashboard,Provider%20section%20to%20display%20it) [\[2\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=5.%20Click%20,OAuth%20Client%20ID) [\[3\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=9,section%20of%20the%20Supabase%20Dashboard) [\[10\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=supabase.auth.signInWithOAuth%28) [\[11\]](https://supabase.com/docs/guides/auth/social-login/auth-google#:~:text=handle%20the%20code%20exchange,to%20your%20redirect%20allow%20list) Login with Google | Supabase Docs

[https://supabase.com/docs/guides/auth/social-login/auth-google](https://supabase.com/docs/guides/auth/social-login/auth-google)

[\[4\]](https://docs.stripe.com/payments/checkout/free-trials#:~:text=You%20can%20configure%20a%20Checkout,one%20of%20the%20following%20parameters) Configure free trials | Stripe Documentation

[https://docs.stripe.com/payments/checkout/free-trials](https://docs.stripe.com/payments/checkout/free-trials)

[\[5\]](https://supabase.com/docs/guides/auth/server-side/nextjs#:~:text=Always%20use%20,pages%20and%20user%20data) Setting up Server-Side Auth for Next.js | Supabase Docs

[https://supabase.com/docs/guides/auth/server-side/nextjs](https://supabase.com/docs/guides/auth/server-side/nextjs)

[\[6\]](https://docs.stripe.com/api/checkout/sessions/create?lang=cli#:~:text=client%20_%20reference%20_%20id,string) Create a Checkout Session | Stripe API Reference

[https://docs.stripe.com/api/checkout/sessions/create?lang=cli](https://docs.stripe.com/api/checkout/sessions/create?lang=cli)

[\[7\]](https://docs.stripe.com/billing/subscriptions/webhooks#:~:text=,this%20event%2C%20you%20can%20provision) [\[8\]](https://docs.stripe.com/billing/subscriptions/webhooks#:~:text=,Invoicing%20won%E2%80%99t) Using webhooks with subscriptions | Stripe Documentation

[https://docs.stripe.com/billing/subscriptions/webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

[\[9\]](https://docs.stripe.com/api/events#:~:text=triggers%20a%20,event) Events | Stripe API Reference

[https://docs.stripe.com/api/events](https://docs.stripe.com/api/events)