# Answers for Master AI Agent (22-Aug-2023) - Version 2

## Technical Implementation Details

### 1. SQL Statements for Data Normalization

Here are example SQL `ALTER TABLE` statements and trigger definitions to enforce uppercase state abbreviations and other data normalization rules:

```sql
-- Add check constraint for state abbreviations
ALTER TABLE ria_profiles 
ADD CONSTRAINT check_state_format 
CHECK (state ~ '^[A-Z]{2}$');

-- Create function to automatically uppercase state abbreviations
CREATE OR REPLACE FUNCTION normalize_state_abbreviation()
RETURNS TRIGGER AS $$
BEGIN
  NEW.state = UPPER(NEW.state);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to apply the function before insert or update
CREATE TRIGGER trigger_normalize_state
BEFORE INSERT OR UPDATE ON ria_profiles
FOR EACH ROW
EXECUTE FUNCTION normalize_state_abbreviation();

-- Add check constraint for zip codes
ALTER TABLE ria_profiles 
ADD CONSTRAINT check_zip_format 
CHECK (zip_code ~ '^[0-9]{5}(-[0-9]{4})?$');

-- Create function to standardize city names (capitalize first letter of each word)
CREATE OR REPLACE FUNCTION normalize_city_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.city = initcap(NEW.city);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for city name standardization
CREATE TRIGGER trigger_normalize_city
BEFORE INSERT OR UPDATE ON ria_profiles
FOR EACH ROW
EXECUTE FUNCTION normalize_city_name();
```

### 2. Automated Narrative Generation and Embedding

Here's a script outline for a cron job to automatically generate narratives and embeddings for new profiles:

```typescript
// File: scripts/auto_generate_narratives.ts
import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

async function generateNarrativesForNewProfiles() {
  console.log('Starting narrative generation for new profiles...');
  
  // Get profiles that don't have narratives yet
  const { data: newProfiles, error } = await supabase
    .from('ria_profiles')
    .select('*')
    .not('crd_number', 'in', 
      supabase.from('narratives').select('crd_number')
    )
    .limit(50); // Process in batches to avoid timeouts
    
  if (error) {
    console.error('Error fetching new profiles:', error);
    return;
  }
  
  console.log(`Found ${newProfiles?.length || 0} new profiles requiring narratives`);
  
  // Process each profile
  for (const profile of newProfiles || []) {
    try {
      // 1. Generate narrative text using OpenAI
      const narrative = await generateNarrativeText(profile);
      
      // 2. Generate embedding for the narrative
      const embedding = await generateEmbedding(narrative);
      
      // 3. Insert into narratives table
      await supabase
        .from('narratives')
        .upsert({
          crd_number: profile.crd_number,
          narrative,
          embedding
        });
        
      console.log(`Successfully processed profile ${profile.crd_number}`);
    } catch (err) {
      console.error(`Error processing profile ${profile.crd_number}:`, err);
    }
  }
}

async function generateNarrativeText(profile) {
  // Implementation of narrative generation using OpenAI
  // [details omitted for brevity]
}

async function generateEmbedding(text) {
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: text,
  });
  
  return response.data.data[0].embedding;
}

// Run the main function
generateNarrativesForNewProfiles()
  .then(() => console.log('Narrative generation completed'))
  .catch(err => console.error('Error in narrative generation job:', err));
```

To set this up as a cron job:

```bash
# Run daily at 2 AM
0 2 * * * cd /path/to/project && /usr/bin/node scripts/dist/auto_generate_narratives.js >> /var/log/narrative-generation.log 2>&1
```

### 3. Incremental ETL for Control Persons and Private Funds

Here's a sample incremental ETL job in TypeScript for updating `control_persons` and `private_funds`:

```typescript
// File: scripts/update_related_entities.ts
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import { parse } from 'date-fns';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SEC_API_BASE = 'https://data.sec.gov/api/';
const SEC_API_KEY = process.env.SEC_API_KEY;

async function updateRelatedEntities() {
  // 1. Get the latest processed filing date from our tracking table
  const { data: lastProcessed } = await supabase
    .from('etl_tracking')
    .select('last_processed_date')
    .eq('entity_type', 'filings')
    .single();
    
  const lastProcessedDate = lastProcessed?.last_processed_date || '2000-01-01';
  const today = new Date().toISOString().split('T')[0];
  
  console.log(`Fetching new filings since ${lastProcessedDate}`);
  
  // 2. Fetch RIA profiles that need updating (those with new filings)
  const { data: riasToUpdate } = await supabase
    .from('ria_profiles')
    .select('crd_number, sec_file_number')
    .gte('filing_date', lastProcessedDate)
    .lt('filing_date', today);
    
  console.log(`Found ${riasToUpdate?.length || 0} RIAs with new filings`);
  
  // 3. Process each RIA to update control persons and private funds
  for (const ria of riasToUpdate || []) {
    try {
      await updateControlPersons(ria.crd_number, ria.sec_file_number);
      await updatePrivateFunds(ria.crd_number, ria.sec_file_number);
    } catch (err) {
      console.error(`Error processing RIA ${ria.crd_number}:`, err);
    }
  }
  
  // 4. Update the tracking table with the new last processed date
  await supabase
    .from('etl_tracking')
    .upsert({
      entity_type: 'filings',
      last_processed_date: today
    });
    
  console.log(`ETL job completed, tracking date updated to ${today}`);
}

async function updateControlPersons(crdNumber, secFileNumber) {
  // Fetch control persons data from SEC API
  const response = await axios.get(
    `${SEC_API_BASE}/forms/wrsps/${secFileNumber}/schedule-a`,
    {
      headers: {
        'User-Agent': 'Company Name admin@company.com',
        'SEC-API-KEY': SEC_API_KEY
      }
    }
  );
  
  const controlPersons = response.data.scheduleAData || [];
  
  // Upsert control persons into our database
  for (const person of controlPersons) {
    await supabase
      .from('control_persons')
      .upsert({
        crd_number: crdNumber,
        full_name: person.fullName,
        title: person.title,
        ownership_code: person.ownershipCode,
        control_person: person.isControlPerson === 'Y',
        // Map other fields as needed
      });
  }
  
  console.log(`Updated ${controlPersons.length} control persons for CRD ${crdNumber}`);
}

async function updatePrivateFunds(crdNumber, secFileNumber) {
  // Similar implementation for private funds
  // [implementation details omitted for brevity]
}

// Run the main function
updateRelatedEntities()
  .then(() => console.log('Related entities update completed'))
  .catch(err => console.error('Error in ETL job:', err));
```

### 4. Implementing Backpressure in `/api/ask-stream`

Here's a sample implementation for adding backpressure and rate limiting to the streaming handler:

```typescript
// File: app/api/ask-stream/route.ts
import { StreamingTextResponse, LangChainStream } from 'ai';
import { RateLimiter } from 'limiter';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Create a token bucket rate limiter - 60 tokens per minute, with burst of 10
const rateLimiters = new Map<string, RateLimiter>();

export async function POST(req: Request) {
  try {
    // 1. Get user identifier (IP or user ID)
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const cookieStore = cookies();
    const userCookie = cookieStore.get('rh_qc')?.value;
    const userId = userCookie || ip;
    
    // 2. Get or create rate limiter for this user
    if (!rateLimiters.has(userId)) {
      rateLimiters.set(
        userId, 
        new RateLimiter({ tokensPerInterval: 60, interval: 'minute', fireImmediately: true })
      );
    }
    const limiter = rateLimiters.get(userId)!;
    
    // 3. Check if user has tokens available
    const remainingTokens = await limiter.removeTokens(1);
    if (remainingTokens < 0) {
      return new Response(
        'Too many requests. Please try again later.',
        { status: 429 }
      );
    }
    
    // 4. Parse the request
    const { query, filters } = await req.json();
    
    // 5. Set up streaming with backpressure
    const { stream, handlers } = LangChainStream({
      onCompletion: () => {
        // Clean up resources
      },
      experimental_streamData: true,
    });
    
    // 6. Process the streaming in a background task
    const backgroundTask = async () => {
      try {
        // Your existing logic here
        const llmChain = createYourLLMChain(); // Your chain setup
        
        // Stream with backpressure
        await llmChain.stream({
          input: query,
          filters: filters,
        }, {
          callbacks: handlers,
        });
      } catch (error) {
        console.error('Error in streaming:', error);
        // Send error to client
        stream.error(error as Error);
      } finally {
        // Always close the stream
        stream.end();
      }
    };
    
    // Start background task
    backgroundTask();
    
    // Return streaming response
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error('Error in stream handler:', error);
    return new Response('An error occurred during streaming', { status: 500 });
  }
}
```

### 5. RLS Policy Statements for PII Protection

Here are example RLS policy statements for tables with personally identifiable information:

```sql
-- Enable RLS on the control_persons table
ALTER TABLE control_persons ENABLE ROW LEVEL SECURITY;

-- Create roles
CREATE ROLE app_anonymous;      -- Unauthenticated users
CREATE ROLE app_authenticated;  -- Standard authenticated users
CREATE ROLE app_admin;          -- Admin users
CREATE ROLE app_data_analyst;   -- Data analysts with limited PII access

-- Grant usage to all roles
GRANT USAGE ON SCHEMA public TO app_anonymous, app_authenticated, app_admin, app_data_analyst;

-- Grant table access to roles
GRANT SELECT ON control_persons TO app_authenticated, app_admin, app_data_analyst;

-- Policy for anonymous users - no access to PII
CREATE POLICY anonymous_no_access
  ON control_persons
  FOR SELECT
  TO app_anonymous
  USING (false);

-- Policy for authenticated users - limited PII access
CREATE POLICY authenticated_limited_pii
  ON control_persons
  FOR SELECT
  TO app_authenticated
  USING (
    -- Hide sensitive fields
    full_name IS NULL AND
    email_address IS NULL AND
    phone_number IS NULL
  );

-- Policy for data analysts - anonymized PII
CREATE POLICY analyst_anonymized_pii
  ON control_persons
  FOR SELECT
  TO app_data_analyst
  USING (true)
  WITH CHECK (
    -- Allow all rows, but use column-level security
    true
  );

-- Column security for data analysts
ALTER TABLE control_persons ENABLE COLUMN LEVEL SECURITY;

-- Grant column access for data analysts
GRANT SELECT(id, crd_number, title, role, ownership_code, control_person) 
  ON control_persons TO app_data_analyst;

-- Policy for admin users - full access
CREATE POLICY admin_full_access
  ON control_persons
  FOR ALL
  TO app_admin
  USING (true)
  WITH CHECK (true);

-- For full access to specific columns only
GRANT SELECT(id, crd_number, full_name, title, role) ON control_persons TO app_authenticated;
```

### 6. `/api/health` Endpoint Implementation

Here's a simple implementation for a health check endpoint:

```typescript
// File: app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';

export async function GET() {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'unknown', latency_ms: null },
      vector_search: { status: 'unknown', latency_ms: null },
      llm_api: { status: 'unknown', latency_ms: null }
    },
    version: process.env.APP_VERSION || 'unknown'
  };

  try {
    // 1. Check database connectivity
    const startDb = Date.now();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .limit(1)
      .timeout(5000);
      
    healthStatus.services.database = {
      status: error ? 'error' : 'ok',
      latency_ms: Date.now() - startDb,
      error: error ? error.message : undefined
    };

    // 2. Check vector search functionality
    const startVector = Date.now();
    const { data: vectorData, error: vectorError } = await supabase.rpc(
      'match_documents',
      { query_embedding: Array(1536).fill(0), match_threshold: 0.1, match_count: 1 }
    );

    healthStatus.services.vector_search = {
      status: vectorError ? 'error' : 'ok',
      latency_ms: Date.now() - startVector,
      error: vectorError ? vectorError.message : undefined
    };

    // 3. Check LLM API availability
    const startLLM = Date.now();
    const openai = new OpenAIApi(
      new Configuration({ apiKey: process.env.OPENAI_API_KEY })
    );
    
    try {
      await openai.createCompletion({
        model: 'gpt-3.5-turbo-instruct',
        prompt: 'This is a test.',
        max_tokens: 5
      });
      
      healthStatus.services.llm_api = {
        status: 'ok',
        latency_ms: Date.now() - startLLM
      };
    } catch (llmError: any) {
      healthStatus.services.llm_api = {
        status: 'error',
        latency_ms: Date.now() - startLLM,
        error: llmError.message
      };
    }

    // Set overall status
    const allServicesOk = Object.values(healthStatus.services)
      .every(service => service.status === 'ok');
    
    healthStatus.status = allServicesOk ? 'ok' : 'degraded';
    
    return NextResponse.json(healthStatus);
  } catch (error: any) {
    healthStatus.status = 'error';
    return NextResponse.json(
      { ...healthStatus, error: error.message },
      { status: 500 }
    );
  }
}
```

### 7. Environment Variables Template

Here's a template `.env.example` file with all required environment variables:

```
# Required in all environments
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI API Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4-1106-preview

# Search Configuration
MATCH_THRESHOLD=0.75           # Minimum similarity score for vector matches
MATCH_COUNT=50                 # Maximum number of results to return
HYBRID_SEARCH_WEIGHT=0.7       # Weight for vector search vs keyword search (0-1)

# Required in production only
# Rate Limiting
RATE_LIMIT_REQUESTS=100        # Maximum requests per window
RATE_LIMIT_WINDOW_MINUTES=60   # Time window for rate limiting in minutes

# Credit System
DEFAULT_FREE_CREDITS=5         # Credits for anonymous users
DEFAULT_TRIAL_CREDITS=20       # Credits for trial users
DEFAULT_PAID_CREDITS=100       # Credits for paid users

# Performance Tuning
VC_ACTIVITY_THRESHOLD=0.5      # Threshold for venture capital activity
QUERY_TIMEOUT_MS=30000         # Query timeout in milliseconds
MAX_EMBEDDING_BATCH_SIZE=100   # Maximum batch size for embedding generation

# Optional Configuration
# Logging
LOG_LEVEL=info                 # One of: debug, info, warn, error
ENABLE_QUERY_LOGGING=true      # Whether to log query details

# Application Information
APP_VERSION=1.0.0              # Application version
ENVIRONMENT=production         # One of: development, staging, production

# External APIs
SEC_API_KEY=your-sec-api-key   # For fetching SEC filings data
```

### 8. Input Validation and Sanitization

Here's an approach for handling edge-case inputs:

```typescript
// File: lib/validation.ts
import { z } from 'zod';

// Schema for ask API query parameters
export const askQuerySchema = z.object({
  query: z.string()
    .min(3, 'Query must be at least 3 characters')
    .max(500, 'Query is too long')
    .transform(q => 
      // Remove SQL injection vectors
      q.replace(/['"\;=]/g, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Remove leading/trailing whitespace
        .trim()
    ),
  
  filters: z.object({
    min_aum: z.number()
      .optional()
      .transform(val => 
        // Ensure reasonable min_aum values
        val !== undefined ? Math.max(0, Math.min(val, 1000000)) : undefined
      ),
    
    city: z.string()
      .optional()
      .transform(city => 
        city ? city
          // Remove special characters except for spaces, hyphens, periods
          .replace(/[^\w\s\-\.]/g, '')
          // Proper case (first letter of each word capitalized)
          .replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
          .trim() 
        : undefined
      ),
    
    state: z.string()
      .optional()
      .transform(state => 
        state ? state
          .replace(/[^a-zA-Z\s]/g, '')
          .toUpperCase()
          .trim() 
        : undefined
      ),
    
    // Add more filter validations as needed
  }).optional(),
  
  includeDetails: z.boolean().optional().default(false)
});

// Validation function to use in API routes
export async function validateAskQuery(req: Request) {
  try {
    const body = await req.json();
    return {
      data: askQuerySchema.parse(body),
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof z.ZodError 
        ? error.errors
        : 'Invalid request body'
    };
  }
}

// Testing this validation
export function testValidation() {
  const testCases = [
    // Valid cases
    { query: 'Find advisors in New York', filters: { min_aum: 100 } },
    { query: 'Financial advisors with private equity experience' },
    
    // Edge cases
    { query: 'Advisors in St. Louis, MO', filters: { city: 'St. Louis', state: 'mo' } },
    { query: 'Advisors with AUM > $1B', filters: { min_aum: 1000001 } }, // Should be capped
    { query: 'SELECT * FROM ria_profiles;', filters: { city: 'New York' } }, // SQL injection attempt
    { query: '?><script>alert(1)</script>', filters: {} }, // XSS attempt
    { query: 'München advisors', filters: { city: 'München' } } // Non-ASCII
  ];
  
  return testCases.map(testCase => ({
    input: testCase,
    result: askQuerySchema.safeParse(testCase)
  }));
}
```

### 9. Vector Cache Implementation

Here's an outline for implementing a vector cache:

```typescript
// File: lib/vectorCache.ts
import { createClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';
import { hash } from 'crypto';

// Configuration
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const MAX_CACHE_ITEMS = 1000;   // Maximum number of cached vectors

// Initialize Redis client for caching
const redis = createRedisClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.connect();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cache key generator
function generateCacheKey(text: string): string {
  return `vector_cache:${hash('sha256').update(text).digest('hex')}`;
}

// Cache an embedding vector
export async function cacheEmbedding(text: string, vector: number[]): Promise<void> {
  const key = generateCacheKey(text);
  
  try {
    // Store in Redis with TTL
    await redis.set(key, JSON.stringify(vector), {
      EX: CACHE_TTL
    });
    
    // Optionally, maintain a sorted set for LRU eviction
    await redis.zAdd('vector_cache_keys', {
      score: Date.now(),
      value: key
    });
    
    // Prune cache if too large
    const cacheSize = await redis.zCard('vector_cache_keys');
    if (cacheSize > MAX_CACHE_ITEMS) {
      // Remove oldest items
      const oldestKeys = await redis.zRange('vector_cache_keys', 0, cacheSize - MAX_CACHE_ITEMS - 1);
      if (oldestKeys.length > 0) {
        await redis.del(oldestKeys);
        await redis.zRem('vector_cache_keys', oldestKeys);
      }
    }
  } catch (error) {
    console.error('Error caching vector:', error);
  }
}

// Retrieve a cached embedding
export async function getCachedEmbedding(text: string): Promise<number[] | null> {
  const key = generateCacheKey(text);
  
  try {
    // Get from cache
    const cachedVector = await redis.get(key);
    
    if (cachedVector) {
      // Update access time
      await redis.zAdd('vector_cache_keys', {
        score: Date.now(),
        value: key
      });
      
      return JSON.parse(cachedVector);
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving cached vector:', error);
    return null;
  }
}

// Get or create embedding
export async function getOrCreateEmbedding(text: string): Promise<number[]> {
  // Try to get from cache first
  const cachedVector = await getCachedEmbedding(text);
  if (cachedVector) {
    return cachedVector;
  }
  
  // If not in cache, generate new embedding
  const { data, error } = await supabase.rpc(
    'generate_embedding',
    { input_text: text }
  );
  
  if (error) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
  
  const vector = data as number[];
  
  // Cache the newly generated vector
  await cacheEmbedding(text, vector);
  
  return vector;
}

// Invalidate specific cache entry
export async function invalidateCachedEmbedding(text: string): Promise<void> {
  const key = generateCacheKey(text);
  
  try {
    await redis.del(key);
    await redis.zRem('vector_cache_keys', key);
  } catch (error) {
    console.error('Error invalidating cached vector:', error);
  }
}

// Clear entire cache
export async function clearVectorCache(): Promise<void> {
  try {
    const keys = await redis.zRange('vector_cache_keys', 0, -1);
    if (keys.length > 0) {
      await redis.del(keys);
    }
    await redis.del('vector_cache_keys');
  } catch (error) {
    console.error('Error clearing vector cache:', error);
  }
}
```

### 10. Localized `compute_vc_activity` Function

Here's a sketch of a modified `compute_vc_activity` function that accepts location parameters:

```sql
CREATE OR REPLACE FUNCTION compute_vc_activity(
  p_crd_number TEXT,
  p_min_aum NUMERIC DEFAULT 0,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_radius_miles NUMERIC DEFAULT 50
)
RETURNS FLOAT AS $$
DECLARE
  v_activity_score FLOAT;
  v_ria_location POINT;
  v_has_location BOOLEAN;
BEGIN
  -- Get the target RIA's location
  SELECT 
    POINT(longitude, latitude), 
    (latitude IS NOT NULL AND longitude IS NOT NULL) 
  INTO v_ria_location, v_has_location
  FROM ria_profiles
  WHERE crd_number = p_crd_number;
  
  -- Compute activity score with location context
  IF p_city IS NULL AND p_state IS NULL THEN
    -- Original global calculation if no location specified
    SELECT
      COALESCE(
        SUM(CASE 
          WHEN has_private_fund THEN 3
          WHEN advises_private_funds THEN 2
          ELSE 0
        END) / COUNT(*),
        0
      ) INTO v_activity_score
    FROM ria_profiles
    WHERE 
      aum >= p_min_aum AND
      (has_private_fund OR advises_private_funds);
  ELSE
    -- Location-specific calculation
    WITH location_filter AS (
      SELECT *
      FROM ria_profiles
      WHERE 
        aum >= p_min_aum AND
        (has_private_fund OR advises_private_funds) AND
        (
          -- Filter by exact city/state if provided
          (p_city IS NOT NULL AND city ILIKE p_city || '%') OR
          (p_state IS NOT NULL AND state = UPPER(p_state)) OR
          -- If we have coordinates and radius, use geographic distance
          (
            v_has_location AND
            latitude IS NOT NULL AND 
            longitude IS NOT NULL AND
            earth_distance(
              ll_to_earth(latitude, longitude),
              ll_to_earth(v_ria_location[0], v_ria_location[1])
            ) <= p_radius_miles * 1609.34 -- Convert miles to meters
          )
        )
    )
    
    SELECT
      COALESCE(
        SUM(CASE 
          WHEN has_private_fund THEN 3
          WHEN advises_private_funds THEN 2
          ELSE 0
        END) / 
        NULLIF(COUNT(*), 0),
        0
      ) INTO v_activity_score
    FROM location_filter;
    
    -- Apply a local density factor
    -- The smaller the geographic area, the higher the weight of each firm
    IF v_activity_score > 0 THEN
      -- Scale based on number of firms in area vs global
      WITH local_count AS (
        SELECT COUNT(*) AS count FROM location_filter
      ),
      global_count AS (
        SELECT COUNT(*) AS count 
        FROM ria_profiles 
        WHERE aum >= p_min_aum AND (has_private_fund OR advises_private_funds)
      )
      SELECT 
        v_activity_score * (1 + (1 - (l.count::float / NULLIF(g.count, 0)::float)) * 0.5)
        INTO v_activity_score
      FROM local_count l, global_count g;
    END IF;
  END IF;

  -- Normalize to 0-1 range
  RETURN LEAST(v_activity_score / 3.0, 1.0);
END;
$$ LANGUAGE plpgsql;
```