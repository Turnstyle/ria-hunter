# **Master Awesome Plan: ria-hunter (Backend Agent) \- Detailed**

## **1\. Executive Summary & Guiding Principles**

**The Core Mandate:** Your primary mission is to evolve from a database frontend into a sophisticated **Answer Composition Engine**. The system currently retrieves structured data correctly but fails to synthesize it into a natural, conversational answer. This plan outlines the precise, detailed steps to build that missing "generative AI vibe."

**The Unified Strategy:**

1. **Fix the Core First (Claude's Focus):** Our absolute priority is building the answer composition layer. We will implement a robust Retrieval-Augmented Generation (RAG) pipeline.  
2. **Pragmatism Over Perfection (ChatGPT's Philosophy):** We will ship what works **now** to get immediate user feedback. This means defaulting to the most stable AI provider (OpenAI), deploying the MVP to production quickly, and consciously deferring complex features.  
3. **Architect for the Future (Gemini's Vision):** We will build the immediate fixes as the foundational layer of a more advanced, scalable RAG architecture, preventing technical debt.

## **2\. Dependencies, Tooling & Agent Capabilities**

This section outlines the tools, libraries, and protocols available to you.

### **Core Dependencies**

* **next**: The React framework for production.  
* **openai**: The official Node.js library for interacting with the OpenAI API.  
* **@supabase/supabase-js**: The official client for interacting with the Supabase database and services.  
* **@google-cloud/vertexai**: (For future use) The client library for Google's Vertex AI platform.

### **Platform & Services**

* **Vercel**: The hosting platform for the Next.js application.  
* **Supabase**: The backend-as-a-service provider for the PostgreSQL database, authentication, and storage.  
* **OpenAI API**: The primary LLM provider for the MVP.

### **Agent Capabilities & Protocols**

* **Github MCP (Model Context Protocol)**: You have access to the project's codebase via the Github MCP. Use this to read existing files, understand the current architecture, and write new code.  
* **Supabase MCP**: You have direct access to the Supabase project schema and can interact with the database. Use this to verify table structures and design SQL queries.  
* **Vercel CLI**: You can use the vercel CLI to check deployment status (vercel list), view production logs (vercel logs ria-hunter-app \--prod), and troubleshoot build errors.  
* **Google Cloud CLI (gcloud)**: Available for future integration with Vertex AI services.

## **3\. The Critical Path to MVP: A Phased Implementation**

### **Phase 1: Foundational Integrity (Target: Week 1\)**

Before building, we ensure the data, configuration, and core logic are pristine.

**Action 1.1: Solidify AI Provider Configuration**

* **Task:** Abstract the AI provider logic to be stable and flexible. Set **OpenAI as the default provider** for production stability.  
* **Detailed Code (lib/ai-providers.ts):**  
  // A more detailed service for handling multiple AI providers  
  import OpenAI from 'openai';  
  // import { VertexAI } from '@google-cloud/vertexai'; // Placeholder for future

  const openai \= new OpenAI({ apiKey: process.env.OPENAI\_API\_KEY });  
  // const vertex\_ai \= new VertexAI({project: '...', location: '...'});

  const providers \= {  
    openai: {  
      generate: async (prompt: string) \=\> {  
        const completion \= await openai.chat.completions.create({  
          messages: \[{ role: 'user', content: prompt }\],  
          model: 'gpt-4o', // Or gpt-3.5-turbo for speed  
        });  
        return completion.choices\[0\].message.content;  
      }  
    },  
    vertexai: { // For future use  
      generate: async (prompt:string) \=\> { /\* ... Vertex AI logic ... \*/ return "Vertex response"; }  
    }  
  };

  export function getAiService() {  
    const providerName \= process.env.AI\_PROVIDER || 'openai';  
    const selectedProvider \= providers\[providerName\] || providers.openai; // Fallback to OpenAI

    if (\!process.env.OPENAI\_API\_KEY) {  
        console.error("OpenAI API Key is missing\!");  
        // Return a mock service to prevent crashes  
        return { generate: async (p: string) \=\> "Error: AI provider not configured." };  
    }

    return selectedProvider;  
  }

* **Documentation:**  
  * [OpenAI Node.js Library](https://github.com/openai/openai-node)  
  * [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)

**Action 1.2: Enforce Data Hygiene**

* **Task:** Purge all fabricated, placeholder, and malformed data from the production database.  
* **Detailed SQL Script:**  
  \-- Run this as a single transaction to ensure data integrity.  
  BEGIN;

  \-- 1\. Remove clearly fabricated test data.  
  DELETE FROM ria\_profiles WHERE crd\_number \>= 999000;  
  DELETE FROM control\_persons WHERE firm\_crd\_number \>= 999000;

  \-- 2\. Clean malformed data (example: non-numeric AUM).  
  UPDATE ria\_profiles  
  SET aum \= CASE  
      WHEN aum \~ '^\[0-9\\.\]+$' THEN aum::numeric  
      ELSE NULL  
  END;

  \-- 3\. Ensure critical columns are not NULL where they shouldn't be.  
  DELETE FROM ria\_profiles WHERE crd\_number IS NULL OR legal\_name IS NULL;

  COMMIT;

* **Documentation:**  
  * [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)

**Action 1.3: Define & Compute the "VC Activity" Metric**

* **Task:** Create a concrete, computable SQL function for "most active" that also aggregates executive data.  
* **Detailed SQL Function (with control\_persons join):**  
  CREATE OR REPLACE FUNCTION compute\_vc\_activity(state\_filter text DEFAULT NULL, result\_limit integer DEFAULT 10\)  
  RETURNS TABLE (  
    crd\_number bigint,  
    legal\_name text,  
    city text,  
    state text,  
    vc\_fund\_count bigint,  
    vc\_total\_aum numeric,  
    activity\_score numeric,  
    executives jsonb \-- Aggregate executives into a JSON array  
  ) AS $$  
  BEGIN  
    RETURN QUERY  
    WITH ranked\_firms AS (  
      SELECT  
        rp.crd\_number,  
        rp.legal\_name,  
        rp.city,  
        rp.state,  
        COUNT(DISTINCT rpf.id) as vc\_fund\_count,  
        COALESCE(SUM(rpf.gross\_asset\_value), 0\) as vc\_total\_aum,  
        \-- Activity Score \= 60% fund count \+ 40% AUM scale (in millions)  
        (COUNT(DISTINCT rpf.id) \* 0.6 \+ COALESCE(SUM(rpf.gross\_asset\_value) / 1000000, 0\) \* 0.4) as activity\_score  
      FROM ria\_profiles rp  
      JOIN ria\_private\_funds rpf ON rp.crd\_number \= rpf.crd\_number  
        AND rpf.fund\_type ILIKE ANY(ARRAY\['%venture%', '%vc%', '%startup%'\])  
      WHERE (state\_filter IS NULL OR rp.state \= state\_filter)  
      GROUP BY rp.crd\_number, rp.legal\_name, rp.city, rp.state  
      HAVING COUNT(rpf.id) \> 0  
      ORDER BY activity\_score DESC  
      LIMIT result\_limit  
    )  
    SELECT  
      rf.crd\_number,  
      rf.legal\_name,  
      rf.city,  
      rf.state,  
      rf.vc\_fund\_count,  
      rf.vc\_total\_aum,  
      rf.activity\_score,  
      \-- Use JSON\_AGG to gather all executives for each firm into a single JSON field.  
      (SELECT jsonb\_agg(json\_build\_object('name', cp.full\_name, 'title', cp.title))  
       FROM control\_persons cp  
       WHERE cp.firm\_crd\_number \= rf.crd\_number) as executives  
    FROM ranked\_firms rf;  
  END;  
  $$ LANGUAGE plpgsql;

* **Documentation:**  
  * [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)  
  * [PostgreSQL JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)

### **Phase 2: Build the Answer Composition Engine (Target: Week 1-2)**

This is the core of the solution: a new, robust /api/ask endpoint that performs a complete RAG sequence.

**Step 2.1: The /api/ask Endpoint Orchestrator**

* **File:** app/api/ask/route.ts  
* **Code:**  
  import { NextRequest, NextResponse } from 'next/server';  
  import { callLLMToDecomposeQuery } from './planner';  
  import { executeEnhancedQuery } from './retriever';  
  import { buildAnswerContext } from './context-builder';  
  import { generateNaturalLanguageAnswer } from './generator';

  export async function POST(request: NextRequest) {  
    try {  
      const { query } \= await request.json();  
      if (\!query) {  
        return NextResponse.json({ error: 'Query is required' }, { status: 400 });  
      }  
      const decomposedPlan \= await callLLMToDecomposeQuery(query);  
      const structuredData \= await executeEnhancedQuery(decomposedPlan);  
      const context \= buildAnswerContext(structuredData, query);  
      const answer \= await generateNaturalLanguageAnswer(query, context);

      return NextResponse.json({  
        answer: answer,  
        sources: structuredData,  
        metadata: { plan: decomposedPlan }  
      });  
    } catch (error) {  
      console.error('Error in /api/ask:', error);  
      return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });  
    }  
  }

* **Documentation:**  
  * [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

**Step 2.2: The Planner (Query Decomposition)**

* **File:** app/api/ask/planner.ts  
* **Task:** Use a fast LLM to deconstruct the user's question into a machine-readable JSON object.

**Step 2.3: The Retriever (Structured Data Fetching)**

* **File:** app/api/ask/retriever.ts  
* **Code:**  
  import { createClient } from '@supabase/supabase-js'  
  const supabase \= createClient(process.env.SUPABASE\_URL\!, process.env.SUPABASE\_SERVICE\_ROLE\_KEY\!)

  export async function executeEnhancedQuery(plan: any) {  
    const { filters, limit } \= plan;  
    const { data, error } \= await supabase.rpc('compute\_vc\_activity', {  
      state\_filter: filters.location,  
      result\_limit: limit  
    });

    if (error) {  
      console.error('Error fetching from Supabase RPC:', error);  
      throw new Error('Database query failed.');  
    }  
    return data;  
  }

* **Documentation:**  
  * [Supabase: Call a database function](https://supabase.com/docs/reference/javascript/rpc)

**Step 2.4: The Context Builder (Briefing Document)**

* **File:** app/api/ask/context-builder.ts  
* **Task:** Transform the raw database results into a clean, human-readable "briefing document" for the final LLM prompt. This step is critical for high-quality generation.

**Step 2.5: The Generator (Grounded Answer Synthesis)**

* **File:** app/api/ask/generator.ts  
* **Task:** Use a powerful LLM to synthesize the final answer, strictly adhering to the context provided by the context-builder.

## **4\. Post-MVP Roadmap & Architecture**

**High-Priority Next Steps:**

1. **Implement Streaming (SSE):** Create a new /api/ask-stream endpoint. Use an async generator (async function\*) to yield tokens as they arrive from the LLM API's streaming interface.  
   * **Documentation:** [Next.js Streaming with Route Handlers](https://www.google.com/search?q=https://nextjs.org/docs/app/building-your-application/routing/route-handlers%23streaming), [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)  
2. **Build Evaluation Framework:** Create an automated script to run a "golden set" of test queries against the API and use an LLM-as-a-Judge to score the responses for faithfulness and relevance, preventing regressions.

**Future Architectural Upgrades:**

* **Semantic Search:** Use the pgvector extension in Supabase to enable search based on conceptual meaning, not just keywords.  
  * **Documentation:** [Supabase pgvector Guide](https://supabase.com/docs/guides/database/extensions/pgvector)  
* **Hybrid Search & Re-ranking:** Combine keyword and vector search results, then use a dedicated re-ranker model to select the most relevant documents for the LLM context, dramatically improving accuracy.  
  * **Example Tool:** [Cohere Rerank](https://cohere.com/rerank)