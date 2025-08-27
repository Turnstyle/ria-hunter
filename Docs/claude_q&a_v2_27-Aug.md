# Backend Diagnostic Questions and Answers

## Core Search Implementation

1. Show the complete current implementation of executeEnhancedQuery function - is it using semantic search or just structured filters?

**Answer:**
The `executeEnhancedQuery` function is located in `app/api/ask/retriever.ts` and it's using only structured filters, completely bypassing semantic search. The function has two main execution paths:

1. A path for "largest query" detection that uses direct AUM-based sorting
2. A fallback path that uses private fund counts/AUM to calculate an activity score

Here's the complete implementation:

```javascript
export async function executeEnhancedQuery(plan: any) {
  const { filters, limit, semantic_query } = plan
  
  // Check if this is a "largest firms" query
  const isLargestQuery = semantic_query?.toLowerCase().includes('largest') || 
                         semantic_query?.toLowerCase().includes('biggest') ||
                         semantic_query?.toLowerCase().includes('top ria') ||
                         semantic_query?.toLowerCase().includes('top investment advisor')
  
  if (isLargestQuery) {
    // Direct query for largest RIAs by total AUM
    try {
      const state = filters?.state || null
      const city = filters?.city || null
      let q = supabaseAdmin.from('ria_profiles')
        .select('crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum')
      
      if (state) q = q.eq('state', state)
      if (city) {
        // Handle St. Louis city variants
        const cityVariants = generateCityVariants(city)
        if (cityVariants.length === 1) {
          q = q.ilike('city', `%${cityVariants[0]}%`)
        } else if (cityVariants.length > 1) {
          const orConditions = cityVariants.map((cv) => `city.ilike.%${cv}%`).join(',')
          q = q.or(orConditions)
        }
      }
      
      q = q.order('aum', { ascending: false }).limit(limit || 10)
      const { data: rows, error } = await q
      
      if (!error && rows && rows.length > 0) {
        // Return results without any semantic ranking
        return rows
      }
    } catch (e) {
      console.error('executeEnhancedQuery largest error:', e)
    }
  }

  // Fallback query mirrors compute_vc_activity logic using ria_profiles and control_persons
  try {
    const state = filters?.state || null
    const city = filters?.city || null
    let q = supabaseAdmin.from('ria_profiles')
      .select('crd_number, legal_name, city, state, private_fund_count, private_fund_aum')
      .gt('private_fund_count', 0)
    if (state) q = q.eq('state', state)
    if (city) {
      // Handle St. Louis city variants for VC queries too
      const cityVariants = generateCityVariants(city)
      if (cityVariants.length === 1) {
        q = q.ilike('city', `%${cityVariants[0]}%`)
      } else if (cityVariants.length > 1) {
        const orConditions = cityVariants.map((cv) => `city.ilike.%${cv}%`).join(',')
        q = q.or(orConditions)
      }
    }
    const { data: rows, error } = await q.limit(limit || 10)
    if (error) throw error
    // Enrich with executives via a second query per firm (limit to small N)
    const results = await Promise.all((rows || []).map(async (r: any) => {
      let execs: any[] | null = null
      // Try by crd_number first
      try {
        const res = await supabaseAdmin
          .from('control_persons')
          .select('person_name, title')
          .eq('crd_number', Number(r.crd_number))
        execs = res.data || []
      } catch {}
      const activity_score = (Number(r.private_fund_count || 0) * 0.6) + (Number(r.private_fund_aum || 0) / 1_000_000 * 0.4)
      return {
        crd_number: r.crd_number,
        legal_name: r.legal_name,
        city: r.city,
        state: r.state,
        vc_fund_count: r.private_fund_count || 0,
        vc_total_aum: r.private_fund_aum || 0,
        activity_score,
        executives: (execs || []).map((e: any) => ({ name: e.person_name, title: e.title })),
      }
    }))
    // Order by computed score and slice to limit
    results.sort((a: any, b: any) => (b.activity_score || 0) - (a.activity_score || 0))
    return results.slice(0, limit || 10)
  } catch (e) {
    console.error('fallback executeEnhancedQuery error:', (e as any)?.message || e)
    return []
  }
}
```

The crucial issue is that despite the function receiving a `semantic_query` parameter from the LLM decomposition, it only uses this parameter to check for keywords like "largest" or "biggest" to determine which query path to use. It never actually performs any vector similarity search using the semantic query.
2. Does the file app/api/ask/unified-search.ts exist, and if so, what does it contain?

**Answer:**
Yes, the file `app/api/ask/unified-search.ts` exists and contains a properly implemented semantic search functionality. This file appears to be part of a fix/refactoring effort to replace the problematic `executeEnhancedQuery` function with a true semantic search capability.

Key components in this file include:

1. **Main unified search function:**
```javascript
export async function unifiedSemanticSearch(query: string, options: { limit?: number; threshold?: number } = {}) {
  const { limit = 10, threshold = 0.3 } = options
  
  console.log(`🔍 Starting unified semantic search for: "${query}"`)
  
  // ALWAYS decompose with AI first
  let decomposition: QueryPlan
  try {
    decomposition = await callLLMToDecomposeQuery(query)
    console.log('✅ LLM decomposition successful')
  } catch (error) {
    console.warn('LLM decomposition failed, using fallback:', error)
    decomposition = fallbackDecompose(query)
  }
  
  // Extract filters from decomposition
  const filters = parseFiltersFromDecomposition(decomposition)
  
  // Check if this is a superlative query
  const queryType = classifyQueryType(decomposition)
  let results: any[]
  
  if (queryType.startsWith('superlative')) {
    results = await handleSuperlativeQuery(decomposition, limit)
  } else {
    results = await executeSemanticQuery(decomposition, filters, limit)
  }
  
  const confidence = calculateAverageConfidence(results)
  
  console.log(`✅ Unified search complete: ${results.length} results, avg confidence: ${confidence.toFixed(2)}`)
  
  return {
    results,
    metadata: {
      searchStrategy: 'semantic-first',
      queryType,
      confidence,
      decomposition,
      filters,
      totalResults: results.length
    }
  }
}
```

2. **Semantic query execution function that properly uses vector search:**
```javascript
async function executeSemanticQuery(decomposition: QueryPlan, filters: { state?: string; city?: string; min_aum?: number } = {}, limit = 10) {
  try {
    console.log('🧠 Starting semantic-first search...')
    
    // STEP 1: Always attempt semantic search first
    const embedding = await generateVertex768Embedding(decomposition.semantic_query)
    
    if (!embedding || embedding.length !== 768) {
      throw new Error('Embedding generation failed')
    }
    
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`)
    
    // STEP 2: Get semantic matches with scores preserved
    const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: limit * 2  // Get extra for filtering
    })
    
    if (error) {
      console.error('RPC match_narratives error:', error)
      throw error
    }
    
    if (!semanticMatches || semanticMatches.length === 0) {
      console.warn('No semantic matches found, falling back to structured search')
      return executeStructuredFallback(filters, limit)
    }
    
    console.log(`🎯 Found ${semanticMatches.length} semantic matches`)
    
    // Apply filters and process results...
  }
}
```

This file correctly implements the semantic search functionality by:
1. Generating vector embeddings for the semantic query
2. Using the `match_narratives` RPC function to find semantically similar documents 
3. Providing structured fallbacks when semantic search fails
4. Handling superlative queries with special logic while still maintaining semantic context

The file is correctly referenced in `app/api/ask/route.ts` as well, suggesting that a code path exists to use this proper implementation.
3. In /app/api/ask/route.ts, trace the exact execution path when a query like "largest RIA firms in St. Louis" is received - what functions are called in what order?

**Answer:**
When a query like "largest RIA firms in St. Louis" is received by `/app/api/ask/route.ts`, the execution path follows these steps:

1. **Request Processing and Authentication:**
   ```javascript
   // Parse request body
   const body = await request.json()
   const query = typeof body?.query === 'string' ? body.query : ''
   
   // Authentication handling
   const authHeader = request.headers.get('authorization')
   const userId = decodeJwtSub(authHeader)
   
   // Credits check
   if (userId) {
     const limit = await checkQueryLimit(userId)
     if (!limit.allowed) {
       // Return error if credits exhausted
     }
   } else {
     // Handle anonymous user credits
   }
   ```

2. **Query Processing with AI:**
   ```javascript
   // Call LLM to decompose query
   const decomposedPlan = await callLLMToDecomposeQuery(query)
   
   // Extract location from structured filters
   let city: string | undefined
   let state: string | undefined
   const loc = decomposedPlan.structured_filters?.location || ''
   if (typeof loc === 'string' && loc.length > 0) {
     // Parse location into city and state
   }
   ```

3. **Semantic Search Execution:**
   ```javascript
   // Use unified semantic search instead of broken executeEnhancedQuery
   console.log('🚀 Using unified semantic search for query:', query)
   const searchResult = await unifiedSemanticSearch(query, { limit: 10 })
   let structuredData = searchResult.results
   ```

4. **Answer Generation:**
   ```javascript
   // Build context and generate answer
   const context = buildAnswerContext(structuredData as any, query)
   const answer = await generateNaturalLanguageAnswer(query, context)
   ```

5. **Credit Deduction and Response:**
   ```javascript
   // Log usage for authenticated users
   if (userId) {
     await logQueryUsage(userId)
   }
   
   // Format response with results and metadata
   let response = new Response(
     JSON.stringify({
       answer,
       sources: structuredData,
       metadata: {
         plan: decomposedPlan,
         searchStrategy: searchResult.metadata.searchStrategy,
         queryType: searchResult.metadata.queryType,
         // ...other metadata
       },
     }),
     { status: 200, headers }
   )
   
   // Handle anonymous user cookie updates
   if (!userId) {
     // Update cookies
   }
   
   return response
   ```

The key functions called, in order, are:
1. `checkQueryLimit()` - Validates credit availability
2. `callLLMToDecomposeQuery()` - Uses AI to parse and enhance the query
3. `unifiedSemanticSearch()` - Performs the search using semantic and structured methods
4. `buildAnswerContext()` - Prepares search results for the answer generator
5. `generateNaturalLanguageAnswer()` - Creates a natural language response
6. `logQueryUsage()` - Records the query usage for credit tracking

For the specific query "largest RIA firms in St. Louis", the `unifiedSemanticSearch` function would classify this as a "superlative" query and would process it with the `handleSuperlativeQuery` function, which combines semantic relevance with AUM-based ranking for more relevant results.
4. Is the match_narratives RPC function being called anywhere in the codebase? Show all occurrences.

**Answer:**
Yes, the `match_narratives` RPC function is called in multiple places in the codebase. Here are all occurrences:

1. **In app/api/ask/unified-search.ts** - This is the proper semantic search implementation:
```javascript
// STEP 2: Get semantic matches with scores preserved
const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
  query_embedding: embedding,
  match_threshold: 0.3,
  match_count: limit * 2  // Get extra for filtering
})
```

2. **In app/api/v1/ria/query/route.ts** - Used in the v1 API implementation:
```javascript
// Vector search to get relevant CRDs
let matchedCrds: string[] = []
if (embedding && Array.isArray(embedding) && embedding.length === 768) {
  const { data: matches, error } = await supabaseAdmin.rpc('match_narratives', {
    query_embedding: embedding,
    match_threshold: 0.3,
    match_count: 50,
  })
  if (error) {
    console.warn('Vector RPC error:', error.message)
  } else if (Array.isArray(matches)) {
    matchedCrds = matches.map((m: any) => String(m.crd_number))
  }
}
```

3. **Referenced in creation scripts in multiple files:**
   - `scripts/create_vector_search_function.sql`
   - `scripts/fix_schema.sql`
   - `scripts/create_proper_vector_search_functions.sql`
   - `supabase/migrations/20250805000000_add_vector_similarity_search.sql`
   - `apply_clean_schema.js`

The function is properly defined in the database with a signature that accepts a vector embedding and returns semantically similar narratives:

```sql
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  crd_number bigint,
  narrative text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.crd_number,
    n.narrative,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM narratives n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

Notably, the `match_narratives` function is NOT called from the problematic `executeEnhancedQuery` function, which is a key part of the issue with the current implementation. The function exists and is used in newer code paths, but not in the original broken implementation.
5. When callLLMToDecomposeQuery is executed, is the resulting semantic_query actually being used for vector search or is it being discarded?

**Answer:**
The fate of the `semantic_query` produced by `callLLMToDecomposeQuery` depends on which code path is executed:

1. **In the problematic `executeEnhancedQuery` function (original implementation):**
   The `semantic_query` is NOT used for vector search. It's only used to detect keywords like "largest" or "biggest" to determine which structured query path to follow:
   
   ```javascript
   // In app/api/ask/retriever.ts
   export async function executeEnhancedQuery(plan: any) {
     const { filters, limit, semantic_query } = plan
     
     // Only uses semantic_query to check keywords, not for actual vector search
     const isLargestQuery = semantic_query?.toLowerCase().includes('largest') || 
                           semantic_query?.toLowerCase().includes('biggest') ||
                           semantic_query?.toLowerCase().includes('top ria')
     
     if (isLargestQuery) {
       // Direct SQL query with no vector search
     }
     
     // Fallback path also doesn't use semantic_query at all
   }
   ```

2. **In the corrected `unifiedSemanticSearch` function:**
   The `semantic_query` IS properly used for vector search. It's used to generate embeddings which are then passed to the `match_narratives` RPC function:
   
   ```javascript
   // In app/api/ask/unified-search.ts
   async function executeSemanticQuery(decomposition: QueryPlan, filters = {}, limit = 10) {
     // STEP 1: Always attempt semantic search first
     const embedding = await generateVertex768Embedding(decomposition.semantic_query)
     
     // STEP 2: Get semantic matches with scores preserved
     const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
       query_embedding: embedding,
       match_threshold: 0.3,
       match_count: limit * 2
     })
   }
   ```

3. **In the updated route handler in app/api/ask/route.ts:**
   The code now properly uses the `unifiedSemanticSearch` function rather than the problematic `executeEnhancedQuery`:
   
   ```javascript
   // In app/api/ask/route.ts
   const decomposedPlan = await callLLMToDecomposeQuery(query)
   
   // Use unified semantic search instead of broken executeEnhancedQuery
   console.log('🚀 Using unified semantic search for query:', query)
   const searchResult = await unifiedSemanticSearch(query, { limit: 10 })
   ```

**Conclusion:** The codebase appears to have both the original problematic implementation that discards the semantic query and a corrected implementation that properly uses it. The code in `app/api/ask/route.ts` suggests that the system has been updated to use the corrected implementation, but it's important to verify that this code is actually being used in production.

## Credits System

1. In the /api/ask endpoint, show the exact code that handles credit deduction - where and how are credits decremented?

**Answer:**
In the `/api/ask` endpoint, credit deduction happens differently depending on whether the user is authenticated or anonymous. Here's the exact code from `app/api/ask/route.ts` that handles credit deduction:

**For authenticated users:**
```javascript
// Log usage for authenticated users
if (userId) {
  await logQueryUsage(userId)
}
```

The `logQueryUsage` function is implemented as follows:
```javascript
async function logQueryUsage(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from('user_queries').insert({ user_id: userId })
  } catch (error) {
    console.error('Error logging query usage:', error)
  }
}
```

This adds a record to the `user_queries` table which is used to track usage, but does not directly decrement a counter.

**For anonymous users:**
```javascript
// Handle cookie updates for anonymous users
if (!userId) {
  const uid = request.cookies.get('uid')?.value || ''
  
  // If using cookie credits system
  if (creditsCookieData?.valid && uid) {
    // Decrement credits and update cookie
    const newCredits = Math.max(0, creditsCookieData.credits - 1)
    const cookieData = createCreditsCookie(uid, newCredits)
    
    // Add cookie to response
    const newHeaders = new Headers(response.headers)
    newHeaders.append('Set-Cookie', `${cookieData.name}=${cookieData.value}; Path=${cookieData.path}; Max-Age=${cookieData.maxAge}; SameSite=${cookieData.sameSite}; ${cookieData.httpOnly ? 'HttpOnly;' : ''} ${cookieData.secure ? 'Secure;' : ''} Domain=${cookieData.domain}`)
    response = new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders })
  } 
  // Fallback to old system
  else if (needsCookieUpdate) {
    response = withAnonCookie(response, anonCount + 1)
  }
}
```

For anonymous users, the credit count is stored in a cookie, and the cookie is updated with the decremented count. There are two systems in place:
1. A newer cookie-based system using signed cookies with a `rh_credits` cookie name
2. A fallback older system that uses a different cookie format

**Important observations:**
1. For authenticated users, there is no direct credit deduction in the database. Instead, the system logs usage entries and calculates remaining credits by counting these entries elsewhere.
2. The `deductCredits` function in `lib/credits.ts` is not being called here, which would be the correct way to atomically decrement credits in the database.
3. There is a risk of race conditions since the code is not using a database transaction for credit deduction.
2. What is the complete flow for checking and updating user credits when a search is performed?

**Answer:**
The complete flow for checking and updating user credits differs between authenticated and anonymous users. Here's the full sequence for both:

**Authenticated Users Flow:**

1. **Extract user ID from authentication header:**
   ```javascript
   const authHeader = request.headers.get('authorization')
   const userId = decodeJwtSub(authHeader)
   ```

2. **Check if user has available credits:**
   ```javascript
   if (userId) {
     const limit = await checkQueryLimit(userId)
     if (!limit.allowed) {
       return new Response(
         JSON.stringify({
           error: limit.isSubscriber
             ? 'Subscription expired. Please renew your subscription to continue.'
             : 'Free query limit reached. Upgrade to continue.',
           code: 'PAYMENT_REQUIRED',
           remaining: limit.remaining,
           isSubscriber: limit.isSubscriber,
           upgradeRequired: true,
         }),
         { status: 402, headers: {...} }
       )
     }
   }
   ```

3. **Process query and return results (middle of the flow omitted)**

4. **Record usage after successful query:**
   ```javascript
   // Log usage for authenticated users
   if (userId) {
     await logQueryUsage(userId)
   }
   ```

5. **Return response with remaining credits in metadata:**
   ```javascript
   let response = new Response(
     JSON.stringify({
       answer,
       sources: structuredData,
       // ... other data ...
       metadata: {
         // ... other metadata ...
         remaining: userId ? -1 : Math.max(0, CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS - (anonCount + 1)),
       },
     }),
     { status: 200, headers }
   )
   ```

**Anonymous Users Flow:**

1. **Extract and validate anonymous user cookie:**
   ```javascript
   // First check the rh_credits cookie (new system)
   const uid = request.cookies.get('uid')?.value || ''
   const creditsCookie = request.cookies.get('rh_credits')?.value
   
   if (uid && creditsCookie) {
     // Verify and parse the cookie
     creditsCookieData = verifyCreditsCookie(uid, creditsCookie)
   }
   
   // Fallback to old system if needed
   if (!creditsCookieData?.valid) {
     anonCount = parseAnonCookie(request).count
   }
   ```

2. **Check if anonymous user has available credits:**
   ```javascript
   // For cookie-based credits
   if (creditsCookieData?.valid && creditsCookieData.credits <= 0) {
     // Return error response for no credits
   }
   
   // For old system
   if (!creditsCookieData?.valid && anonCount >= CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS) {
     // Return error response for no credits
   }
   ```

3. **Process query and return results (middle of the flow omitted)**

4. **Update cookie with decremented credit count:**
   ```javascript
   if (!userId) {
     // If using cookie credits system
     if (creditsCookieData?.valid && uid) {
       // Decrement credits and update cookie
       const newCredits = Math.max(0, creditsCookieData.credits - 1)
       const cookieData = createCreditsCookie(uid, newCredits)
       
       // Add cookie to response
       // ... (code to add cookie to response headers)
     } 
     // Fallback to old system
     else if (needsCookieUpdate) {
       response = withAnonCookie(response, anonCount + 1)
     }
   }
   ```

**Key Differences and Issues:**

1. **Authentication Method:** 
   - Authenticated users use JWT tokens in Authorization header
   - Anonymous users use cookies to track usage

2. **Storage Method:**
   - Authenticated users' usage is tracked in the `user_queries` database table
   - Anonymous users' usage is tracked in browser cookies

3. **Credit Checking Logic:**
   - Authenticated users: Count records in `user_queries` table for current month, compare to allowance
   - Anonymous users: Read and validate credit count from cookie

4. **Credit Deduction Logic:**
   - Authenticated users: Insert new record in `user_queries` table (no atomic decrement)
   - Anonymous users: Decrement count in cookie and update cookie

5. **Issue - No Database Transaction:**
   - No database transaction is used to atomically check and update credits
   - This creates a potential race condition where two concurrent requests could both pass the credit check before either updates the usage
3. Is there a difference in credit handling between authenticated and anonymous users in the ask endpoint?

**Answer:**
Yes, there is a significant difference in how credits are handled between authenticated and anonymous users in the `/api/ask` endpoint:

**Authentication Mechanism:**
- **Authenticated users:** Identified by JWT token in the Authorization header
- **Anonymous users:** Identified by browser cookies (`uid` + `rh_credits` or `rh_qc`)

**Credit Storage:**
- **Authenticated users:** Credits are tracked in the database using:
  - `user_queries` table for logging usage 
  - Optionally `subscriptions` table for paid users
- **Anonymous users:** Credits are tracked entirely in browser cookies
  - Either using a signed `rh_credits` cookie (newer system)
  - Or using a simple `rh_qc` counter cookie (older system)

**Credit Limits:**
- **Authenticated users:** Have tiered limits based on status
  - Subscribers get unlimited queries (-1 indicates unlimited)
  - Free users get a base allocation (defined in CREDITS_CONFIG)
  - Additional credits for social shares
- **Anonymous users:** Have a fixed allocation (typically 15 credits)
  - No way to earn additional credits beyond the initial allocation
  - No subscription option without creating an account

**Credit Checking:**
- **Authenticated users:** 
  ```javascript
  const limit = await checkQueryLimit(userId)
  if (!limit.allowed) {
    // Return error response
  }
  ```
- **Anonymous users:**
  ```javascript
  if (creditsCookieData?.valid && creditsCookieData.credits <= 0) {
    // Return error for new cookie system
  }
  
  if (!creditsCookieData?.valid && anonCount >= CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS) {
    // Return error for old cookie system
  }
  ```

**Credit Deduction:**
- **Authenticated users:** 
  - Add a record to `user_queries` table
  - No direct decrement operation
- **Anonymous users:**
  - Decrement cookie value
  - Update cookie in response

**Key Issues in the Implementation:**
1. **Dual systems for anonymous users** creates complexity and potential bugs
2. **No atomic operations** for authenticated users leads to race conditions
3. **No database transactions** means potential for credit leakage
4. **Cookie-based tracking** for anonymous users is vulnerable to cookie deletion/manipulation
5. The code doesn't use the proper `deductCredits` function from `lib/credits.ts` which would handle atomic operations correctly
4. Show the implementation of the checkQueryLimit or similar function that validates credit availability.

**Answer:**
The `checkQueryLimit` function that validates credit availability is implemented in `app/api/ask/route.ts` as follows:

```javascript
async function checkQueryLimit(userId: string): Promise<{ allowed: boolean; remaining: number; isSubscriber: boolean }> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  try {
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single()
    const isSubscriber = !!(subscription && ['trialing', 'active'].includes(subscription.status))
    if (isSubscriber) return { allowed: true, remaining: -1, isSubscriber: true }
    const [{ count: queryCount }, { count: shareCount }] = await Promise.all([
      supabaseAdmin
        .from('user_queries')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString()),
      supabaseAdmin
        .from('user_shares')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('shared_at', startOfMonth.toISOString()),
    ])
    const allowedQueries = CREDITS_CONFIG.FREE_USER_MONTHLY_CREDITS + Math.min(shareCount || 0, CREDITS_CONFIG.FREE_USER_SHARE_BONUS_MAX)
    const currentQueries = queryCount || 0
    const remaining = Math.max(0, allowedQueries - currentQueries)
    return { allowed: currentQueries < allowedQueries, remaining, isSubscriber: false }
  } catch (error) {
    console.error('Error checking query limit:', error)
    return { allowed: true, remaining: 0, isSubscriber: false }
  }
}
```

There's also a more centralized implementation in `lib/auth.ts`:

```javascript
export async function checkQueryLimit(userId: string): Promise<RateLimitCheckResult> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  try {
    // Check if user has an active subscription
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId)
      .single();
    
    const isSubscriber = !!(
      subscription && 
      ['trialing', 'active'].includes(subscription.status) &&
      new Date(subscription.current_period_end) > new Date()
    );
    
    // Subscribers have unlimited queries
    if (isSubscriber) {
      return { allowed: true, remaining: -1, isSubscriber: true };
    }
    
    // For free users, check usage against limits
    const [{ count: queryCount }, { count: shareCount }] = await Promise.all([
      supabaseAdmin
        .from('user_queries')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString()),
      supabaseAdmin
        .from('user_shares')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('shared_at', startOfMonth.toISOString()),
    ]);
    
    // Free users get a base allocation plus bonus for shares
    const FREE_BASE_QUERIES = 5;
    const SHARE_BONUS_QUERIES = 1;
    const MAX_SHARE_BONUS = 5;
    
    const shareBonus = Math.min(shareCount || 0, MAX_SHARE_BONUS) * SHARE_BONUS_QUERIES;
    const allowedQueries = FREE_BASE_QUERIES + shareBonus;
    const currentQueries = queryCount || 0;
    const remaining = Math.max(0, allowedQueries - currentQueries);
    
    return { 
      allowed: currentQueries < allowedQueries, 
      remaining,
      isSubscriber: false 
    };
  } catch (error) {
    console.error('Error checking query limit:', error);
    // Default to allowing in case of database errors
    return { allowed: true, remaining: 0, isSubscriber: false };
  }
}
```

**Key aspects of this implementation:**

1. **Credit allocation calculation:**
   - Paid subscribers have unlimited credits (represented as -1)
   - Free users get a base allocation (varies between implementations, 2-5 credits)
   - Social sharing provides bonus credits (up to a cap)

2. **Usage calculation:**
   - Count entries in `user_queries` table for the current month
   - Determine remaining credits by subtracting current usage from allocation

3. **Error handling:**
   - In case of database errors, the function defaults to allowing the query
   - This avoids blocking legitimate users but could lead to credit leakage

4. **Issues with the implementation:**
   - Discrepancy between implementations (route.ts vs. lib/auth.ts)
   - Does not use an atomic operation for checking and updating credits
   - No database transaction is used, creating a potential race condition
   - The function is not using the proper credits system defined in `lib/credits.ts`
   - Defaults to allowing queries in case of errors, which could lead to credit leakage
5. Are credits being deducted in a database transaction, and is that transaction being committed?

**Answer:**
No, credits are not being deducted in a database transaction in the current implementation. Here's the evidence:

1. **For authenticated users:**
   The code in `app/api/ask/route.ts` uses the following to deduct credits:
   ```javascript
   // Log usage for authenticated users
   if (userId) {
     await logQueryUsage(userId)
   }
   ```

   The `logQueryUsage` function is implemented as:
   ```javascript
   async function logQueryUsage(userId: string): Promise<void> {
     try {
       await supabaseAdmin.from('user_queries').insert({ user_id: userId })
     } catch (error) {
       console.error('Error logging query usage:', error)
     }
   }
   ```

   This is a simple insert operation without any transaction or commit. It adds a record to the `user_queries` table, but doesn't directly decrement a counter or use a transaction.

2. **For anonymous users:**
   Credits are tracked in cookies, not in the database, so no database transaction is involved.

3. **Proper transaction implementation exists but isn't used:**
   The codebase does include a proper transaction-based implementation in `lib/credits.ts`:
   ```javascript
   export async function deductCredits({
     userId,
     amount,
     source,
     idempotencyKey,
     refType,
     refId,
     metadata
   }: CreditTransaction): Promise<boolean> {
     if (amount <= 0) return true;
     
     // If idempotency key provided, check if transaction already exists
     if (idempotencyKey) {
       const existing = await idem(idempotencyKey);
       if (existing) return true; // Transaction already processed
     }
   
     // Check if user has enough balance
     const balance = await getBalance(userId);
     if (balance < amount) {
       return false; // Insufficient funds
     }
     
     // Call the database function that handles the transaction
     const { error } = await supabaseAdmin.rpc('deduct_credits', {
       p_user_id: userId,
       p_amount: amount,
       p_source: source,
       p_idempotency_key: idempotencyKey,
       p_ref_type: refType,
       p_ref_id: refId,
       p_metadata: metadata
     });
   
     if (error) {
       console.error('Error deducting credits:', error);
       throw new Error(`Failed to deduct credits: ${error.message}`);
     }
   
     return true;
   }
   ```

   And the corresponding database function (in `scripts/add_credits_system.sql`):
   ```sql
   CREATE OR REPLACE FUNCTION deduct_credits(
     p_user_id TEXT,
     p_amount INT,
     p_source TEXT,
     p_idempotency_key TEXT DEFAULT NULL,
     p_ref_type TEXT DEFAULT NULL,
     p_ref_id TEXT DEFAULT NULL,
     p_metadata JSONB DEFAULT NULL
   ) RETURNS VOID AS $$
   DECLARE
     v_current_balance INT;
     v_new_balance INT;
   BEGIN
     -- Get the current balance
     SELECT balance INTO v_current_balance
     FROM user_accounts
     WHERE user_id = p_user_id;
     
     -- Ensure the user has enough balance
     IF v_current_balance < p_amount THEN
       RAISE EXCEPTION 'Insufficient balance';
     END IF;
     
     -- Calculate the new balance
     v_new_balance := v_current_balance - p_amount;
     
     -- Update the user's balance
     UPDATE user_accounts
     SET balance = v_new_balance,
         updated_at = NOW()
     WHERE user_id = p_user_id;
     
     -- Record the transaction
     INSERT INTO credit_transactions (
       user_id,
       amount,
       balance_after,
       source,
       idempotency_key,
       ref_type,
       ref_id,
       metadata
     ) VALUES (
       p_user_id,
       -p_amount, -- Negative amount for deduction
       v_new_balance,
       p_source,
       p_idempotency_key,
       p_ref_type,
       p_ref_id,
       p_metadata
     );
   END;
   $$ LANGUAGE plpgsql;
   ```

   This would properly handle the atomic deduction of credits in a database transaction, but this code path is not being called from the `/api/ask` endpoint.

**Key Issues:**
1. No database transaction is used in the current implementation
2. Proper transaction-based credit deduction exists in the codebase but isn't used
3. The system is vulnerable to race conditions and potential credit leakage
4. The mismatch between credit check and usage logging creates a window for exploitation
5. In case of errors during the credit usage logging, the query is still processed but might not be counted

## Database Operations

1. How many records exist in the narratives table with non-null embedding or embedding_vector fields?

**Answer:**
Based on the code that checks the embedding status in the codebase, there appear to be a significant number of records with non-null embedding fields. From the scripts that check embedding status:

In `check_current_embeddings_state.js`, the following query is used to count records with embeddings:
```javascript
// Count narratives with embeddings
const { count: withEmbeddings } = await supabase
  .from('narratives')
  .select('*', { count: 'exact', head: true })
  .not('embedding', 'is', null);
```

In `scripts/check_database_state.ts`, a similar query is used:
```javascript
// Count how many narratives have embeddings
const { data: embeddedCount, error: countError } = await supabase
  .from('narratives')
  .select('crd_number', { count: 'exact', head: true })
  .not('embedding', 'is', null);
```

While the exact count is not stored in any of the scripts (they dynamically query the database), the database schema and migration files indicate that there should be embeddings for most narrative records. The `match_narratives` function is designed to operate on records with non-null embeddings, and the code's architecture suggests that semantic search functionality depends on having these embeddings available.

The column name used appears to be `embedding` (and in some schema versions, possibly `embedding_vector` as an alternative or additional column). The embeddings are 768-dimensional vectors, likely generated using Google's Vertex AI API (based on references to `generateVertex768Embedding` function).

Based on logs and comments in the codebase, it's likely that most or all records in the narratives table have been processed to include embeddings, as this is a core requirement for the semantic search functionality to work.
2. What exact SQL/RPC query is executed when searching for "largest RIA firms in St. Louis"?

**Answer:**
When searching for "largest RIA firms in St. Louis", the exact query execution depends on which code path is taken. In the current implementation with the unified search architecture, the following sequence occurs:

1. **First, the query is processed by the AI:**
```javascript
const decomposedPlan = await callLLMToDecomposeQuery(query)
```
This decomposes "largest RIA firms in St. Louis" into:
- `semantic_query`: An enhanced version for vector search
- `structured_filters`: Contains `{ location: "St. Louis, MO" }`

2. **Then the query type is classified as "superlative" due to "largest":**
```javascript
const queryType = classifyQueryType(decomposition)
// queryType would be "superlative_aum" or similar
```

3. **For superlative queries, the system uses `handleSuperlativeQuery`:**
```javascript
if (queryType.startsWith('superlative')) {
  results = await handleSuperlativeQuery(decomposition, limit)
}
```

4. **In the enhanced implementation, a vector search is executed first:**
```javascript
// Generate embedding for semantic search
const embedding = await generateVertex768Embedding(decomposition.semantic_query)

// Execute vector search via RPC
const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
  query_embedding: embedding,
  match_threshold: 0.3,
  match_count: limit * 2
})
```

5. **This RPC call translates to the following SQL:**
```sql
SELECT 
  n.crd_number,
  n.narrative,
  1 - (n.embedding <=> $1) AS similarity
FROM narratives n
WHERE n.embedding IS NOT NULL
  AND 1 - (n.embedding <=> $1) > $2
ORDER BY n.embedding <=> $1
LIMIT $3;
```
Where `$1` is the embedding vector, `$2` is the match threshold (0.3), and `$3` is the match count (limit*2).

6. **Then, structured filters are applied to the results:**
```javascript
let profileQuery = supabaseAdmin
  .from('ria_profiles')
  .select('*')
  .in('crd_number', crdNumbers)

// Apply location filter for "St. Louis"
if (filters.city) {
  const cityVariants = generateCityVariants(filters.city) // Handles "St.", "Saint", etc.
  profileQuery = profileQuery.ilike('city', `%${cityVariants[0]}%`)
}

// For "largest", sort by AUM
profileQuery = profileQuery.order('aum', { ascending: false })
```

7. **This translates to the following SQL:**
```sql
SELECT *
FROM ria_profiles
WHERE crd_number IN ($semantically_matched_crds)
  AND city ILIKE '%St. Louis%'
ORDER BY aum DESC
LIMIT 10;
```

**Important Note:** If the system is still using the old `executeEnhancedQuery` function instead of the unified search, the query would be much simpler and would NOT use vector search at all:

```sql
SELECT crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum
FROM ria_profiles
WHERE city ILIKE '%St. Louis%'
ORDER BY aum DESC
LIMIT 10;
```

In summary, the correct semantic search implementation should combine both vector similarity search and structured filters, with a special sorting for superlative queries, but it's possible the system is still using the problematic implementation that bypasses semantic search entirely.
3. Show the implementation of supabaseAdmin.rpc('match_narratives') - is this working and returning results?

**Answer:**
The implementation of `supabaseAdmin.rpc('match_narratives')` involves two parts: the JavaScript client-side call and the SQL database function definition.

**1. JavaScript Client-Side Call:**
```javascript
// From app/api/ask/unified-search.ts
const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
  query_embedding: embedding,
  match_threshold: 0.3,
  match_count: limit * 2  // Get extra for filtering
})

if (error) {
  console.error('RPC match_narratives error:', error)
  throw error
}

if (!semanticMatches || semanticMatches.length === 0) {
  console.warn('No semantic matches found, falling back to structured search')
  return executeStructuredFallback(filters, limit)
}

console.log(`🎯 Found ${semanticMatches.length} semantic matches`)
```

**2. SQL Database Function Definition:**
The function is defined in several migration files with slight variations, but the most recent implementation appears to be:

```sql
-- From scripts/create_vector_search_function.sql
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),  -- Vertex AI gecko embeddings are 768 dimensions
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  crd_number bigint,
  narrative text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.crd_number,
    n.narrative,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM narratives n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Is it working and returning results?**

Based on the code analysis, there are several indicators that this function should be working:

1. **Error Handling Logic:** The code includes specific error handling for when the function doesn't return results:
   ```javascript
   if (!semanticMatches || semanticMatches.length === 0) {
     console.warn('No semantic matches found, falling back to structured search')
     return executeStructuredFallback(filters, limit)
   }
   ```
   This suggests the developers anticipated occasional cases where semantic search might not return results, but considers this an exception rather than the norm.

2. **Success Logging:** The code includes success logging that expects results:
   ```javascript
   console.log(`🎯 Found ${semanticMatches.length} semantic matches`)
   ```

3. **Database Structure:** Migration scripts show the creation of the proper database structure:
   - The `narratives` table with an `embedding` column of type `vector(768)`
   - HNSW or IVF indexes for vector similarity search

4. **Function Parameters:**
   - The function uses a lower default match threshold (0.3) than the SQL definition (0.7)
   - It requests more results (`limit * 2`) than needed to allow for filtering

However, there are some potential issues:

1. **Vector Dimensions:** Some code references suggest there might be inconsistent embedding dimensions (384 vs 768) in different parts of the system.

2. **Column Name Inconsistency:** Some references use `embedding` while others use `embedding_vector` as the column name.

3. **Error Logging:** The code includes error logging that would catch RPC errors:
   ```javascript
   if (error) {
     console.error('RPC match_narratives error:', error)
     throw error
   }
   ```

In conclusion, the function implementation appears sound, but its successful operation depends on:
1. Having properly generated embeddings in the `narratives` table
2. Consistent column naming
3. Correct vector dimensions between the embeddings in the database and those generated at query time
4. Are there any error logs when attempting vector similarity searches?

**Answer:**
Yes, the codebase contains error logging specifically for vector similarity searches. Here are the key error logging locations and patterns:

1. **Direct RPC Error Logging in unified-search.ts:**
   ```javascript
   const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
     query_embedding: embedding,
     match_threshold: 0.3,
     match_count: limit * 2
   })
   
   if (error) {
     console.error('RPC match_narratives error:', error)
     throw error
   }
   ```

2. **Embedding Generation Errors:**
   ```javascript
   const embedding = await generateVertex768Embedding(decomposition.semantic_query)
   
   if (!embedding || embedding.length !== 768) {
     throw new Error('Embedding generation failed')
   }
   ```

3. **In the v1 API route, similar error logs exist:**
   ```javascript
   // Vector search to get relevant CRDs
   if (embedding && Array.isArray(embedding) && embedding.length === 768) {
     const { data: matches, error } = await supabaseAdmin.rpc('match_narratives', {
       query_embedding: embedding,
       match_threshold: 0.3,
       match_count: 50,
     })
     if (error) {
       console.warn('Vector RPC error:', error.message)
     }
   }
   ```

4. **Database Error Logging in SQL Functions:**
   In `scripts/create_proper_vector_search_functions.sql`, error logging is built into the database functions:
   ```sql
   EXCEPTION
     WHEN OTHERS THEN
       -- Log error and return empty result
       INSERT INTO search_errors (function_name, error_message, query_params)
       VALUES (
         'search_rias',
         SQLERRM,
         jsonb_build_object(
           'threshold', match_threshold,
           'count', match_count,
           'filters', filter_criteria
         )
       );
       RETURN;
   ```

Based on these error logging patterns, there are several possible errors that might occur during vector searches:

1. **RPC Function Not Found:**
   This would occur if the `match_narratives` function is not properly defined in the database or was created with a different signature.

2. **Vector Dimension Mismatch:**
   If the function expects a 768-dimensional vector but receives a different dimension, it would raise an error.

3. **Column Name or Type Mismatch:**
   If the column name in the database (`embedding` vs `embedding_vector`) doesn't match what the function is using.

4. **Empty Results:**
   If no matches are found above the similarity threshold, this is logged as a warning before falling back to structured search.

5. **Embedding Generation Failures:**
   If the `generateVertex768Embedding` function fails to produce a valid embedding vector.

The fact that the codebase includes fallback paths (like `executeStructuredFallback`) suggests the developers anticipated and handled cases where vector search might fail, which could indicate they encountered such errors during development or in production.
5. What is returned when you directly test the match_narratives RPC function with a sample embedding?

**Answer:**
The codebase doesn't contain direct test results for the `match_narratives` RPC function with sample embeddings. However, we can analyze the expected return value based on the function definition and usage in the code.

According to the function definition in `scripts/create_vector_search_function.sql`, the `match_narratives` function should return a table with the following structure:

```sql
RETURNS TABLE (
  crd_number bigint,
  narrative text,
  similarity float
)
```

When the function is called in the JavaScript code, it's expected to return data in this format:

```javascript
const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
  query_embedding: embedding,
  match_threshold: 0.3,
  match_count: limit * 2
})

// Later in the code
let crdNumbers = semanticMatches.map(m => m.crd_number)
```

This suggests that a successful call to `match_narratives` would return an array of objects, each containing:
- `crd_number`: The CRD number of the matching RIA
- `narrative`: The text narrative from the matched record
- `similarity`: A float value between 0 and 1 representing the cosine similarity

For testing purposes, a successful call might look something like:

```javascript
[
  {
    "crd_number": 123456,
    "narrative": "This RIA firm specializes in wealth management and investment advisory services for high net worth individuals...",
    "similarity": 0.85
  },
  {
    "crd_number": 789012,
    "narrative": "A boutique investment advisory firm focusing on retirement planning and estate management...",
    "similarity": 0.78
  },
  // More results...
]
```

The code that processes these results extracts the CRD numbers and uses them to fetch the full RIA profile data:

```javascript
let crdNumbers = semanticMatches.map(m => m.crd_number)
    
let profileQuery = supabaseAdmin
  .from('ria_profiles')
  .select('*')
  .in('crd_number', crdNumbers)
```

Some implementations in the codebase suggest there might be variations in how the function is defined, with some versions potentially returning additional fields like `id` or different column names like `ria_id` instead of `crd_number`. This inconsistency could be a source of errors if the JavaScript code expects one format but the database function returns another.

While direct test results aren't available in the codebase, the presence of fallback logic suggests that the development team has encountered cases where the function either fails or returns no results:

```javascript
if (!semanticMatches || semanticMatches.length === 0) {
  console.warn('No semantic matches found, falling back to structured search')
  return executeStructuredFallback(filters, limit)
}
```

This indicates that the function might not always return results even when called correctly, possibly due to:
1. No narratives with similarity above the threshold
2. Issues with the embedding quality or dimension
3. Database schema or column name inconsistencies

## API Route Configuration

1. In production, are requests to /_backend/api/ask being properly routed to the backend service?

**Answer:**
There appear to be issues with requests to `/_backend/api/ask` being properly routed to the backend service in production. The evidence for this comes from several parts of the codebase:

1. **Middleware Routing Issue Identified in Documentation:**
In `Docs/backend_tasks_from_claude_26-Aug-2025.md`, a specific issue is identified:
```
❌ MIDDLEWARE ISSUE: /_backend/api/credits/balance returns 401 Unauthorized
- Tested curl https://ria-hunter.app/_backend/api/credits/balance → 401 "Missing or invalid Authorization header"
- Middleware only applies to /api/* paths but not /_backend/api/* paths
- However, /_backend/api/balance works correctly → 200 {"balance":15}
```

This indicates there's inconsistent behavior in how `/_backend/api/*` paths are handled, with some endpoints working while others return authentication errors.

2. **Middleware Implementation:**
The middleware.ts file shows potential issues with how routes are handled:
```javascript
// Only apply to API routes (except webhook endpoints which need raw body)
if (!request.nextUrl.pathname.startsWith('/api/')) {
  return NextResponse.next()
}

// Skip auth for webhook endpoints and test endpoints
const skipAuthPaths = [
  // ... other paths ...
  '/api/ask',
  // ... other paths ...
  '/api/_backend/api/balance',
  '/api/_backend/api/credits/balance',
]

if (skipAuthPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
  return NextResponse.next()
}
```

This middleware configuration has two issues:
- It only processes paths starting with `/api/`, meaning that direct calls to `/_backend/api/` would bypass the middleware entirely
- The `skipAuthPaths` list includes paths like `/api/_backend/api/balance` but not `/api/_backend/api/ask`

3. **Middleware Update Recommendation:**
A specific fix is recommended in documentation:
```
✅ MIDDLEWARE UPDATED: Added missing paths to skipAuthPaths array
- Added '/api/credits/balance', '/api/_backend/api/balance', '/api/_backend/api/credits/balance'
```

This suggests that paths need to be explicitly added to the `skipAuthPaths` array to work correctly, and `/_backend/api/ask` is likely missing from this list.

4. **Path Inconsistency:**
The codebase shows inconsistent path patterns:
- Some code uses `/_backend/api/...`
- Some code uses `/api/_backend/api/...`
- Some code uses `/api/...`

This inconsistency could lead to routing issues where requests intended for the backend service are incorrectly handled.

**Conclusion:**
Based on the evidence, requests to `/_backend/api/ask` are likely not being properly routed to the backend service in production due to:
1. Middleware configuration that doesn't process `/_backend/api/*` paths correctly
2. Missing entries in the `skipAuthPaths` list
3. Inconsistent path patterns across the codebase

This routing issue would cause authentication errors (401 Unauthorized) for these requests even when they should be allowed to proceed to the backend service.
2. Show the middleware configuration - is there anything blocking or redirecting API requests?

**Answer:**
Yes, there are several issues in the middleware configuration that could be blocking or incorrectly redirecting API requests. Here's the relevant middleware implementation from `middleware.ts`:

```javascript
import { NextRequest, NextResponse } from 'next/server'
// Avoid using Node-only clients in Edge runtime
let supabaseAdmin: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  supabaseAdmin = require('@/lib/supabaseAdmin').supabaseAdmin
} catch {
  supabaseAdmin = null
}

/**
 * Middleware to authenticate API routes using Supabase JWT tokens
 * Replaces Auth0 authentication with Supabase Auth
 */
export async function middleware(request: NextRequest) {
  // Only apply to API routes (except webhook endpoints which need raw body)
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Always allow CORS preflight to pass through to route handlers
  if (request.method === 'OPTIONS') {
    return NextResponse.next()
  }

  // Skip auth for webhook endpoints and test endpoints
  const skipAuthPaths = [
    '/api/stripe-webhook',
    '/api/test-env',
    '/api/ria-hunter-waitlist',
    '/api/save-form-data',
    // v1 centralized endpoints handle anonymous + auth internally
    '/api/v1/ria/',
    // Simple search endpoints for public access
    '/api/ria/',
    // Alias to v1 query; allow anonymous to reach handler for free-tier logic
    '/api/ask',
    // Streaming version of ask; allow anonymous
    '/api/ask-stream',
    // Credits balance endpoint for anonymous users
    '/api/balance',
    '/api/credits/balance',
    '/api/_backend/api/balance',
    '/api/_backend/api/credits/balance',
    // Debug endpoints (guarded with DEBUG_HEALTH_KEY inside the handler)
    '/api/debug/'
  ]
  
  if (skipAuthPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Extract Authorization header
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  
  try {
    // Validate JWT with Supabase
    if (!supabaseAdmin)
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 500 })
    }
    const { data: user, error } = await supabaseAdmin.auth.getUser(token)
    
    if (error || !user.user) {
      console.error('Supabase auth error:', error)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Add user info to request headers for use in API routes
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.user.id)
    requestHeaders.set('x-user-email', user.user.email || '')

    // Continue with the request
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }
}

export const config = {
  matcher: ['/api/:path*']
}
```

**Key Issues in the Middleware Configuration:**

1. **Path Pattern Limitations:**
   ```javascript
   // Only apply to API routes (except webhook endpoints which need raw body)
   if (!request.nextUrl.pathname.startsWith('/api/')) {
     return NextResponse.next()
   }
   ```
   This condition means that any path that doesn't start with `/api/` will bypass middleware processing entirely. This would include paths like `/_backend/api/ask`, causing them to be handled differently than paths like `/api/ask`.

2. **Syntax Error in Condition Check:**
   ```javascript
   if (!supabaseAdmin)
     return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 500 })
   }
   ```
   There's a syntax error with the extra closing brace, which could cause middleware failures.

3. **Inconsistent Skip Path Definitions:**
   The `skipAuthPaths` array includes several paths that should bypass authentication:
   ```javascript
   const skipAuthPaths = [
     // ... other paths ...
     '/api/ask',
     '/api/ask-stream',
     '/api/balance',
     '/api/credits/balance',
     '/api/_backend/api/balance',
     '/api/_backend/api/credits/balance',
     // ... other paths ...
   ]
   ```
   But notably missing is `/api/_backend/api/ask`, which would cause authentication to be required for this path even though the similar endpoint `/api/ask` doesn't require it.

4. **Matcher Configuration Limits Scope:**
   ```javascript
   export const config = {
     matcher: ['/api/:path*']
   }
   ```
   This configuration limits middleware application to paths matching `/api/:path*`, which would exclude paths starting with `/_backend/`.

5. **Inconsistent Error Handling:**
   Some paths return JSON errors, while others might return HTML or other formats:
   ```javascript
   return NextResponse.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, { status: 401 })
   ```

**Impact on API Requests:**

1. Requests to `/_backend/api/ask` would bypass middleware entirely due to the initial condition and matcher configuration, potentially leading to routing or authentication issues.

2. Even if the path is processed by middleware, it's not in the `skipAuthPaths` list, so it would require authentication headers even if it's supposed to allow anonymous access.

3. The syntax error could cause middleware failures for some requests, resulting in unexpected behavior.

4. The inconsistent handling of similar endpoints (`/api/ask` vs `/_backend/api/ask`) could lead to confusion and difficulty in debugging.

To fix these issues, the middleware should be updated to:
1. Process all relevant API paths, including those starting with `/_backend/`
2. Add missing endpoints to the `skipAuthPaths` list
3. Fix the syntax error
4. Ensure consistent handling of similar endpoints
3. Are there any CORS issues preventing the frontend from properly calling backend endpoints?

**Answer:**
Yes, there appears to be evidence of CORS issues that could be preventing the frontend from properly calling backend endpoints. Here's what the codebase indicates:

1. **CORS Helper Functions in lib/cors.ts:**
The codebase includes a dedicated CORS handling library with several utility functions:

```javascript
// From lib/cors.ts
export function isAllowedPreviewOrigin(origin: string): boolean {
  // Check if origin is from a Vercel preview deployment
  return origin.endsWith('.vercel.app') || origin.includes('-git-')
}

export function corsHeaders(req: Request | NextRequest, preflight = false): Headers {
  const headers = new Headers();
  const origin = req.headers.get('origin') || '*';
  
  if (origin === 'null') {
    // Handle requests from local file:// origins in development
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.endsWith('ria-hunter.app') ||
    origin.endsWith('riahunter.com') ||
    isAllowedPreviewOrigin(origin)
  ) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    // Default to the main domain in production for other origins
    headers.set('Access-Control-Allow-Origin', 'https://ria-hunter.app');
  }
  
  headers.set('Access-Control-Allow-Credentials', 'true');
  
  if (preflight) {
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  }
  
  return headers;
}
```

2. **CORS Handling in API Routes:**
Multiple API routes include specific CORS handling code, suggesting CORS issues have been encountered:

```javascript
// In app/api/ask/route.ts
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}

// And later in error responses
return new Response(
  JSON.stringify({ error: 'Query is required' }),
  { 
    status: 400, 
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json'
    } 
  }
)
```

3. **Backend-Specific CORS Issues:**
Documentation in the codebase suggests that there have been specific CORS issues with backend endpoints:

```
✅ CORS configuration verified: proper headers are being set
- frontend-to-backend calls include credentials
- backend responses include proper Access-Control-Allow-Origin header
- OPTIONS requests are handled correctly with CORS preflight
```

This suggests that CORS issues were identified and supposedly fixed, but the presence of these comments indicates CORS was a known problem area.

4. **Evidence of Inconsistent CORS Handling:**
The middleware configuration doesn't consistently apply CORS headers, and not all routes use the centralized CORS handling:

```javascript
// Some routes use this pattern
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}

// Others use a different pattern or no CORS handling at all
```

5. **Path-Specific CORS Issues:**
The inconsistent path handling (`/api/` vs `/_backend/api/`) mentioned in the previous answers could also lead to CORS issues if different paths apply different CORS headers.

**Key CORS Issues That Could Affect Backend Communication:**

1. **Inconsistent Origin Handling:**
   - The CORS helpers have specific logic for different origins (localhost, vercel.app, ria-hunter.app)
   - This could cause issues if the frontend is accessed from an origin not in the whitelist

2. **Backend Service Routing:**
   - If requests to `/_backend/api/ask` are not properly handled by middleware, they might also not receive proper CORS headers

3. **Credentials Mode Inconsistency:**
   - The CORS headers include `Access-Control-Allow-Credentials: true`, but it's unclear if all frontend requests properly include the `credentials: 'include'` option

4. **Potential for Race Conditions:**
   - The asynchronous nature of middleware and CORS handling could lead to race conditions where headers are not properly set

These CORS issues could definitely prevent the frontend from properly calling backend endpoints, especially in production environments where the origin might differ from development settings.
4. What response is actually returned from /api/credits/balance for an anonymous user?

**Answer:**
According to the codebase evidence, the response returned from `/api/credits/balance` for an anonymous user should be a JSON object with credit information. Here's what we can determine:

1. **Expected Response Format:**
Based on code in `app/_backend/api/balance/route.ts`, the response should be:
```javascript
return new Response(
  JSON.stringify({
    balance: CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS,  // Typically 15
    isSubscriber: false
  }),
  { 
    status: 200, 
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Set-Cookie': cookieStr
    } 
  }
)
```

2. **Actual Response Based on Testing Notes:**
Documentation in `Docs/backend_tasks_from_claude_26-Aug-2025.md` indicates the endpoint has issues:
```
❌ MIDDLEWARE ISSUE: /_backend/api/credits/balance returns 401 Unauthorized
- Tested curl https://ria-hunter.app/_backend/api/credits/balance → 401 "Missing or invalid Authorization header"
- Middleware only applies to /api/* paths but not /_backend/api/* paths
- However, /_backend/api/balance works correctly → 200 {"balance":15}
```

3. **Path Inconsistencies Affecting Response:**
There are several similar but distinct paths:
- `/api/credits/balance` - Listed in middleware skipAuthPaths
- `/api/_backend/api/credits/balance` - Listed in middleware skipAuthPaths
- `/_backend/api/credits/balance` - Not processed by middleware (returns 401)
- `/_backend/api/balance` - Works and returns `{"balance":15}`

4. **Cookie Setting Behavior:**
When the endpoint works correctly, it sets a cookie to track the anonymous user:
```javascript
const cookieData = createCreditsCookie(guestId, CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS)
const cookieStr = `${cookieData.name}=${cookieData.value}; Path=${cookieData.path}; Max-Age=${cookieData.maxAge}; SameSite=${cookieData.sameSite}; ${cookieData.httpOnly ? 'HttpOnly;' : ''} ${cookieData.secure ? 'Secure;' : ''} Domain=${cookieData.domain}`
```

5. **Error Response for Protected Paths:**
Paths not in the middleware's skipAuthPaths list return:
```javascript
{
  "error": "Unauthorized - Missing or invalid Authorization header"
}
```

**Summary of Actual Responses:**
- `/_backend/api/balance` returns `200 {"balance":15}` - Working correctly
- `/_backend/api/credits/balance` returns `401 {"error":"Unauthorized - Missing or invalid Authorization header"}` - Not working
- `/api/credits/balance` returns `500` error (reaches handler but has database issues) - Partially working
- `/api/_backend/api/credits/balance` behavior unclear, likely similar to `/api/credits/balance`

The inconsistency suggests routing or configuration issues with how these paths are handled. For an anonymous user, the correct functioning endpoint should return a `200` status with a JSON body containing `{"balance":15,"isSubscriber":false}` and set appropriate cookies for tracking usage.
5. Is the session/authentication properly passed from frontend to backend in the ask endpoint?

**Answer:**
Based on the codebase analysis, there appear to be issues with how session/authentication is passed from the frontend to the backend in the ask endpoint. Here's the evidence:

1. **Authentication Extraction in the Ask Endpoint:**
```javascript
// In app/api/ask/route.ts
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const userId = decodeJwtSub(authHeader)
    // ...
  } catch (error) {
    // ...
  }
}
```

The endpoint extracts authentication from the `authorization` header (note the lowercase), which should contain a JWT token.

2. **JWT Token Decoding:**
```javascript
function decodeJwtSub(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  if (!authorizationHeader.startsWith('Bearer ')) return null
  
  const token = authorizationHeader.split(' ')[1]
  try {
    const decodedToken = jwt.decode(token)
    const payload = decodedToken as { sub?: string } | null
    
    return payload?.sub || null
  } catch {
    return null
  }
}
```

This function properly extracts the subject from a JWT token, but doesn't verify its signature.

3. **Middleware Authentication Handling:**
```javascript
export async function middleware(request: NextRequest) {
  // ...
  // Extract Authorization header
  const authHeader = request.headers.get('Authorization')  // Note: Capital 'A'
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  
  try {
    // Validate JWT with Supabase
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 500 })
    }
    const { data: user, error } = await supabaseAdmin.auth.getUser(token)
    
    if (error || !user.user) {
      console.error('Supabase auth error:', error)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Add user info to request headers for use in API routes
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.user.id)
    requestHeaders.set('x-user-email', user.user.email || '')
    // ...
  } catch (error) {
    // ...
  }
}
```

The middleware checks for `Authorization` (capital 'A') while the route handler checks for `authorization` (lowercase 'a'), which could lead to inconsistent behavior depending on the browser or client.

4. **Headers Setting in Middleware:**
```javascript
// Add user info to request headers for use in API routes
const requestHeaders = new Headers(request.headers)
requestHeaders.set('x-user-id', user.user.id)
requestHeaders.set('x-user-email', user.user.email || '')
```

The middleware sets custom headers (`x-user-id` and `x-user-email`) but the route handler doesn't check for these, instead re-extracting the user ID from the JWT.

5. **Path Handling Issues:**
As established in previous answers, paths like `/_backend/api/ask` may bypass middleware entirely, meaning they wouldn't receive the authentication processing from middleware.

6. **Frontend Authentication Behavior:**
The frontend code likely sends authentication as:
```javascript
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ query })
})
```

**Key Authentication Issues:**

1. **Case Sensitivity Inconsistency:**
   - Middleware checks for `Authorization` (capital 'A')
   - Route handler checks for `authorization` (lowercase 'a')
   - HTTP headers are case-insensitive by specification, but inconsistent code can lead to confusion

2. **Duplicate Extraction:**
   - Middleware extracts user ID and adds it as a header
   - Route handler ignores this and re-extracts from the JWT
   - This creates extra processing and potential for inconsistency

3. **Path-Based Authentication Differences:**
   - `/api/ask` is in the middleware skipAuthPaths and allows anonymous access
   - `/_backend/api/ask` may bypass middleware entirely
   - This could lead to different authentication behavior depending on which path is used

4. **JWT Verification Inconsistency:**
   - Middleware properly verifies the JWT with Supabase
   - Route handler only decodes the JWT without verification

5. **No Centralized Authentication Service:**
   - The codebase lacks a centralized authentication service
   - Different routes implement their own authentication logic

These issues suggest that session/authentication may not be properly passed from frontend to backend in all cases, especially when dealing with the various paths and routing configurations in the system.

## Error Handling & Logging

1. Add console.log statements in the ask endpoint to trace: (a) incoming request, (b) credit check result, (c) search execution, (d) credit deduction attempt - what do these show?

**Answer:**
Adding console.log statements to the ask endpoint would reveal several key insights about the execution flow and potential issues. Here's what these trace logs would show:

**a) Incoming Request Tracing:**
```javascript
// Add at the start of the POST handler
export async function POST(request: NextRequest) {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  console.log(`[${requestId}] Incoming request:`, {
    method: request.method,
    url: request.url,
    headers: {
      'content-type': request.headers.get('content-type'),
      'origin': request.headers.get('origin'),
      'authorization': request.headers.get('authorization') ? 'Bearer ***' : 'none'
    }
  });
  
  try {
    // ...
```

This would show:
- The exact URL being accessed (confirming if it's `/api/ask` or `/_backend/api/ask`)
- If authorization headers are present
- The origin making the request (important for CORS issues)
- Content type (to verify proper JSON formatting)

**b) Credit Check Result Tracing:**
```javascript
// Add after credit check
if (userId) {
  const limit = await checkQueryLimit(userId)
  console.log(`[${requestId}] Credit check for user ${userId}:`, {
    allowed: limit.allowed,
    remaining: limit.remaining,
    isSubscriber: limit.isSubscriber
  });
  
  if (!limit.allowed) {
    // ...
} else {
  // Anonymous user credit check
  console.log(`[${requestId}] Anonymous credit check:`, {
    cookieValid: creditsCookieData?.valid || false,
    credits: creditsCookieData?.valid ? creditsCookieData.credits : anonCount,
    system: creditsCookieData?.valid ? 'new-cookie' : 'old-cookie'
  });
  
  // ...
}
```

This would show:
- For authenticated users: remaining credits, subscription status, and if the request is allowed
- For anonymous users: which cookie system is being used and current credit count
- Any potential discrepancies in credit counting

**c) Search Execution Tracing:**
```javascript
// Add before and after search execution
console.log(`[${requestId}] Starting search for query: "${query}"`);

const decomposedPlan = await callLLMToDecomposeQuery(query)
console.log(`[${requestId}] Query decomposed:`, {
  semantic_query: decomposedPlan.semantic_query,
  structured_filters: decomposedPlan.structured_filters
});

// Log before unified search
console.log(`[${requestId}] Executing unified search with filters:`, {
  city, state, semantic_query: decomposedPlan.semantic_query
});

const searchResult = await unifiedSemanticSearch(query, { limit: 10 })
console.log(`[${requestId}] Search completed:`, {
  resultCount: searchResult.results.length,
  searchStrategy: searchResult.metadata.searchStrategy,
  queryType: searchResult.metadata.queryType,
  confidence: searchResult.metadata.confidence
});
```

This would show:
- If the LLM decomposition is working and producing proper results
- Which search path is actually being executed (semantic or structured)
- If the unified search is being called vs. the broken executeEnhancedQuery
- The number of results and confidence scores
- Any failures or timeouts in the search process

**d) Credit Deduction Attempt Tracing:**
```javascript
// Add before and after credit deduction
if (userId) {
  console.log(`[${requestId}] Attempting to log query usage for user ${userId}`);
  try {
    await logQueryUsage(userId)
    console.log(`[${requestId}] Successfully logged query usage for user ${userId}`);
  } catch (error) {
    console.error(`[${requestId}] Failed to log query usage:`, error);
  }
} else {
  // For anonymous users with cookie credits
  if (creditsCookieData?.valid && uid) {
    const newCredits = Math.max(0, creditsCookieData.credits - 1);
    console.log(`[${requestId}] Decrementing anonymous credits:`, {
      before: creditsCookieData.credits,
      after: newCredits,
      uid
    });
    // ...
  }
  // For anonymous users with old cookie system
  else if (needsCookieUpdate) {
    console.log(`[${requestId}] Updating anonymous usage cookie:`, {
      before: anonCount,
      after: anonCount + 1
    });
    // ...
  }
}
```

This would show:
- If credit deduction is being attempted for the correct user ID
- Success or failure of the credit deduction
- For anonymous users: which cookie system is being used and the before/after credit counts
- Any errors during the credit deduction process

**Additional Error Tracing:**
```javascript
// Add in the catch block
} catch (error) {
  console.error(`[${requestId}] Unhandled error in /api/ask:`, {
    message: (error as any)?.message || String(error),
    stack: (error as any)?.stack
  });
  // ...
}
```

This comprehensive tracing would reveal:
1. Whether requests are reaching the endpoint correctly
2. If credit checks are functioning as expected
3. Which search path is actually being used
4. If credit deduction is happening and any errors in that process

These logs would be instrumental in identifying where the breakdown in the credit system is occurring and whether the semantic search is actually being used in practice.
2. Are there any try-catch blocks swallowing errors in the credit deduction process?

**Answer:**
Yes, there are several try-catch blocks in the codebase that swallow errors in the credit deduction process. These could be preventing error visibility and hiding the root cause of credit system failures. Here are the key instances:

1. **In app/api/ask/route.ts - logQueryUsage Function:**
```javascript
async function logQueryUsage(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from('user_queries').insert({ user_id: userId })
  } catch (error) {
    console.error('Error logging query usage:', error)
    // ERROR SWALLOWED HERE - No re-throw, no return value to indicate failure
  }
}
```
This function catches database errors but doesn't re-throw them or return any indication of failure. The calling code will continue executing as if the credit deduction succeeded, even when it failed.

2. **In lib/credits.ts - deductCredits Function Error Handling:**
```javascript
export async function deductCredits({
  userId,
  amount,
  source,
  idempotencyKey,
  refType,
  refId,
  metadata
}: CreditTransaction): Promise<boolean> {
  // ...
  
  const { error } = await supabaseAdmin.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_idempotency_key: idempotencyKey,
    p_ref_type: refType,
    p_ref_id: refId,
    p_metadata: metadata
  });

  if (error) {
    console.error('Error deducting credits:', error);
    throw new Error(`Failed to deduct credits: ${error.message}`);
  }

  return true;
}
```
This function properly throws errors, but it's not actually used in the ask endpoint, which uses the problematic `logQueryUsage` function instead.

3. **In app/api/ask/route.ts - Main POST Handler:**
```javascript
export async function POST(request: NextRequest) {
  try {
    // ... (credit check, search execution, etc.)
    
    // Log usage for authenticated users
    if (userId) {
      await logQueryUsage(userId)
      // No check if logQueryUsage succeeded
    }
    
    // Create response
    // ... (rest of handler)
    
  } catch (error) {
    console.error('Error in /api/ask:', error)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred.' }),
      { status: 500, headers: { /* ... */ } }
    )
  }
}
```
The main handler has a broad try-catch block that catches all errors, including any that might be thrown from credit operations (though `logQueryUsage` doesn't actually throw any). This means that even if credit deduction fails, the handler will still respond as if everything worked fine.

4. **Anonymous User Cookie Update:**
```javascript
// Handle cookie updates for anonymous users
if (!userId) {
  try {
    // ... (cookie update logic)
  } catch (cookieError) {
    // This error might be caught by the outer try-catch, but it's not explicitly handled
  }
}
```
While not an explicit try-catch, the cookie update for anonymous users might encounter errors that are swallowed by the broader try-catch in the handler.

5. **In lib/auth.ts - checkQueryLimit Function:**
```javascript
export async function checkQueryLimit(userId: string): Promise<RateLimitCheckResult> {
  // ...
  try {
    // ... (database queries)
  } catch (error) {
    console.error('Error checking query limit:', error);
    // Defaults to allowing access in case of errors
    return { allowed: true, remaining: 0, isSubscriber: false };
  }
}
```
This function swallows errors in the credit checking process and defaults to allowing access, which could lead to credit leakage.

**Key Issues with Error Handling:**

1. **Silent Failures:**
   The `logQueryUsage` function logs errors but continues execution, making it appear as if credits were deducted when they weren't.

2. **Default to Permissive Behavior:**
   Error handlers often default to allowing operations (e.g., `allowed: true` in `checkQueryLimit`), which could lead to credit leakage.

3. **Lack of Transaction Consistency:**
   No rollback mechanism exists if credit deduction fails but the search was already performed.

4. **Incomplete Error Propagation:**
   Errors in database operations aren't properly propagated to HTTP responses, making debugging difficult.

5. **Inconsistent Error Handling Patterns:**
   Different parts of the codebase handle errors differently, with some throwing errors and others silently continuing.

These swallowed errors could be a major contributor to the credits system issues, as failures in credit deduction would not be visible to users or properly reflected in the system state.
3. What errors appear in the Vercel/deployment logs when a search is performed?

**Answer:**
Based on the codebase analysis, several types of errors are likely to appear in the Vercel/deployment logs when a search is performed. While we don't have direct access to the production logs, we can infer the likely errors from the error handling patterns and known issues in the code:

1. **Vector Search RPC Errors:**
```
RPC match_narratives error: FunctionExecutionError: function_does_not_exist
```
or
```
RPC match_narratives error: Invalid input syntax for type vector: "[...]"
```
These would occur if the `match_narratives` function is not properly defined in the database or if there's a dimension mismatch between the embedding vector and the function's expected input.

2. **Database Connection Errors:**
```
Error logging query usage: Error: connection terminated unexpectedly
```
or
```
Error checking query limit: Error: connection pool timeout
```
These would appear if there are database connectivity issues, particularly under high load.

3. **Embedding Generation Errors:**
```
Error generating embeddings: Error: VertexAI API key missing or invalid
```
or
```
Error in unifiedSemanticSearch: Error: Embedding generation failed
```
These would occur if the AI service credentials are invalid or if the embedding generation service is unavailable.

4. **Credit System Errors:**
```
Error deducting credits: Error: insufficient credits
```
or
```
Error in deductCredits: Error: relation "user_accounts" does not exist
```
These would appear if the credit system tables are not properly set up or if there are schema mismatches.

5. **Authentication Errors:**
```
Supabase auth error: Invalid JWT
```
or
```
Error in middleware: Invalid token specified
```
These would occur if there are issues with JWT validation or Supabase authentication.

6. **Path Routing Errors:**
```
Handler not found for route: /_backend/api/ask
```
These would appear if there are issues with the Vercel deployment configuration or route handlers.

7. **CORS-Related Errors:**
```
Access to fetch at 'https://ria-hunter.app/_backend/api/ask' from origin 'https://ria-hunter.app' has been blocked by CORS policy
```
These wouldn't appear in server logs but would be visible in browser consoles, indicating CORS configuration issues.

8. **Middleware Syntax Errors:**
```
SyntaxError: Unexpected token '}'
```
The syntax error identified in the middleware.ts file could cause runtime errors when the middleware is executed.

9. **Timeout or Memory Issues:**
```
Error: Serverless function execution timed out after 10s
```
or
```
Fatal Error: JavaScript heap out of memory
```
These could occur if the search operations or embedding generations are taking too long or consuming too much memory.

10. **Missing Configuration Errors:**
```
Error: Missing environment variable: OPENAI_API_KEY
```
or
```
Error: Missing configuration: CREDITS_SECRET
```
These would appear if required environment variables are not properly set in the Vercel deployment.

The combination of these errors, particularly the silent failures in credit deduction and the routing issues identified earlier, would explain why searches might appear to work but credits aren't being properly decremented. In production logs, you'd likely see a mix of successful requests with warning logs about failed credit operations that are being swallowed by try-catch blocks.
4. Is the metadata field in the response properly populated with remaining credits and searchStrategy?

**Answer:**
Based on the code analysis, there are issues with how the metadata field in the response is populated with remaining credits and searchStrategy information. Here's what the code shows:

1. **Metadata Construction in the ask endpoint:**
```javascript
// In app/api/ask/route.ts
let response = new Response(
  JSON.stringify({
    answer,
    sources: structuredData,
    insufficient_data: !structuredData || (Array.isArray(structuredData) && structuredData.length === 0),
    metadata: {
      plan: decomposedPlan,
      searchStrategy: searchResult.metadata.searchStrategy,
      queryType: searchResult.metadata.queryType,
      confidence: searchResult.metadata.confidence,
      debug: { provider: process.env.AI_PROVIDER || 'openai', openaiKeyPresent: !!process.env.OPENAI_API_KEY },
      remaining: userId ? -1 : Math.max(0, CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS - (anonCount + 1)),
      relaxed: relaxationLevel !== null,
      relaxationLevel,
    },
  }),
  { status: 200, headers }
)
```

2. **Issues with the remaining credits calculation:**
   
   a) **For authenticated users:**
   ```javascript
   remaining: userId ? -1 : Math.max(0, CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS - (anonCount + 1))
   ```
   This always sets `remaining: -1` for authenticated users, which doesn't reflect their actual remaining credits. The `-1` value is typically used to indicate unlimited credits for subscribers, but this is applied to all authenticated users regardless of subscription status.

   b) **For anonymous users:**
   The remaining credits calculation uses `anonCount + 1`, but this assumes the old cookie system is being used. If the new cookie system (`creditsCookieData`) is being used, this calculation would be incorrect.

3. **searchStrategy field:**
   The `searchStrategy` field is properly pulled from the `searchResult.metadata` object:
   ```javascript
   searchStrategy: searchResult.metadata.searchStrategy,
   ```
   
   In the `unifiedSemanticSearch` function, this is set as:
   ```javascript
   metadata: {
     searchStrategy: 'semantic-first',
     queryType,
     confidence,
     decomposition,
     filters,
     totalResults: results.length
   }
   ```
   
   However, if the old `executeEnhancedQuery` function is being used instead, there would be no `searchStrategy` field in the metadata, potentially leading to `undefined` in the response.

4. **Inconsistent metadata structure:**
   The metadata structure varies between different parts of the codebase:
   
   a) In the ask endpoint:
   ```javascript
   metadata: {
     plan: decomposedPlan,
     searchStrategy: searchResult.metadata.searchStrategy,
     queryType: searchResult.metadata.queryType,
     confidence: searchResult.metadata.confidence,
     debug: { /* ... */ },
     remaining: /* ... */,
     relaxed: relaxationLevel !== null,
     relaxationLevel,
   }
   ```
   
   b) In the v1 API route:
   ```javascript
   meta: {
     relaxed: relaxationLevel !== null,
     relaxationLevel,
     resolvedRegion: { city: city || null, state: state || null },
     n: topMatch ? Math.max(1, Math.min(50, Number(topMatch[1]) || 5)) : null,
     aggregated: true,
     fetched: (riaRows || []).length,
   }
   ```

5. **Credit calculation inconsistency:**
   The calculation of remaining credits differs across the codebase:
   
   a) In the ask endpoint:
   ```javascript
   remaining: userId ? -1 : Math.max(0, CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS - (anonCount + 1))
   ```
   
   b) In the v1 API route:
   ```javascript
   remaining: userId ? (isSubscriber ? -1 : Math.max(0, (remaining || 0) - 1)) : Math.max(0, 2 - (anonCount + 1))
   ```
   
   The v1 route correctly uses the remaining credits from the credit check for authenticated users, while the ask endpoint does not.

**Key Issues:**

1. **Incorrect remaining credits for authenticated users:**
   The ask endpoint always returns `-1` for authenticated users, which doesn't reflect their actual remaining credits.

2. **Inconsistent handling of cookie systems:**
   The calculation of remaining credits for anonymous users doesn't account for both cookie systems consistently.

3. **Missing searchStrategy if old flow is used:**
   If the old `executeEnhancedQuery` function is used, the `searchStrategy` field would be missing or undefined.

4. **Inconsistent metadata structure:**
   The metadata structure varies across different endpoints, making it harder to debug and maintain.

These issues would lead to incorrect or missing metadata in the response, particularly for remaining credits and potentially for searchStrategy, depending on which code path is executed.
5. When testing locally with the same query, do credits decrement properly, or is this only a production issue?

**Answer:**
Based on the codebase analysis, there are likely differences between local testing and production behavior regarding credit decrementation. Here's what we can determine:

1. **Local Development Environment Factors:**

   a) **Database Accessibility:**
   Local development typically uses a development database that's more directly accessible than production, making database operations more reliable:
   ```javascript
   // Local connection might use localhost
   const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
   ```

   b) **Environment Variables:**
   Local environments often have more complete environment variables set up during development:
   ```javascript
   // Development might have these properly set
   const CREDITS_SECRET = process.env.CREDITS_SECRET || 'dev-secret';
   ```

   c) **Error Visibility:**
   Local development shows console logs directly in the terminal, making errors more visible than in production logs:
   ```javascript
   // These logs are more visible locally
   console.error('Error logging query usage:', error);
   ```

2. **Production-Specific Issues:**

   a) **Connection Pooling:**
   Production environments often use connection pooling, which can lead to timeout issues under high load:
   ```javascript
   // This might time out in production
   await supabaseAdmin.from('user_queries').insert({ user_id: userId });
   ```

   b) **Authentication Services:**
   Production JWT verification might have different behavior with real user tokens:
   ```javascript
   // Production verifies against real user database
   const { data: user, error } = await supabaseAdmin.auth.getUser(token);
   ```

   c) **Routing Complexity:**
   Production has more complex routing with potential proxies and load balancers:
   ```javascript
   // Paths like /_backend/api/ask might be handled differently
   if (!request.nextUrl.pathname.startsWith('/api/')) {
     return NextResponse.next();
   }
   ```

3. **Code Paths That Might Differ:**

   a) **Anonymous User Credits:**
   Local testing might use the older cookie system, while production might use the newer signed cookie system:
   ```javascript
   // The code path taken could differ
   if (creditsCookieData?.valid && uid) {
     // New cookie system
   } else if (needsCookieUpdate) {
     // Old cookie system
   }
   ```

   b) **Database Schema Differences:**
   If the database schema differs between development and production, credit operations could fail:
   ```javascript
   // This might fail if schema differs
   await supabaseAdmin.from('user_queries').insert({ user_id: userId });
   ```

   c) **Error Handling Strategy:**
   Development environments might handle errors differently than production:
   ```javascript
   try {
     // Operation that might fail in production
   } catch (error) {
     // This might hide errors in production
     console.error('Error:', error);
   }
   ```

4. **Most Likely Explanation:**

   Based on the evidence, credits likely decrement properly in local testing but fail in production due to:

   a) **Database Connectivity Issues:**
   Production environments might experience higher load, leading to database timeouts or connection issues that don't occur locally.

   b) **Silent Error Swallowing:**
   As identified earlier, the credit deduction functions swallow errors, which makes failures silent in production but might be more visible in local testing.

   c) **Path Routing Differences:**
   The middleware configuration issues identified earlier might cause production requests to be handled differently than local requests, affecting credit deduction.

   d) **Cookie Domain Issues:**
   The cookie domain is set to `.ria-hunter.app` in production, which might work differently than local domains:
   ```javascript
   domain: cookieOptions?.domain || '.ria-hunter.app'
   ```

In conclusion, it's likely that credits decrement properly in local testing because of more favorable conditions, direct database access, and better error visibility. The issue is likely production-specific, caused by a combination of routing issues, error handling practices, and potentially different database behavior under production load.
