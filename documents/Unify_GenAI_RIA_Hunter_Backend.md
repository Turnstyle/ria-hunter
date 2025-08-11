## **RIA-Hunter: Unified Architecture Overhaul & Integration Plan (v3)**

### **1\. Executive Summary & Mission Briefing**

**Current Situation:** The RIA-Hunter platform is struggling due to a fundamental architectural conflict. It's a system with a "divided brain," split across two repositories: ria-hunter (the backend) and ria-hunter-app (the frontend). The backend possesses powerful GenAI capabilities, but the frontend uses its own separate, brittle, and less intelligent search logic. This leads to inconsistent results, a frustrating user experience (e.g., failing on simple queries like "St Louis"), and a maintenance nightmare.

**The Mission:** We will execute a strategic rewiring of the entire system to resolve these issues permanently. This is not a patch; it is a definitive architectural overhaul. We will consolidate all intelligence into a single, authoritative backend service and transform the frontend into a pure, streamlined user interface.

Expected System Capabilities & Example Queries:  
Upon mission completion, the platform will be capable of answering a wide range of user queries with speed and accuracy. The goal is to move from simple keyword matching to true semantic understanding.

* **Simple, Direct Queries:**  
  * "RIAs in St Louis, MO"  
  * "Show me the top 10 largest RIAs in California by AUM"  
  * "What is the contact info for Buckingham Strategic Wealth?"  
* **Complex & Multi-faceted Queries:**  
  * "Find RIAs in Texas with over $1 billion in AUM that specialize in retirement planning for doctors."  
  * "Which firms in the Pacific Northwest work with tech executives and offer private placement investments?"  
* **Nuanced & Conceptual Queries:**  
  * "I'm a startup founder who just sold my company. Which RIAs can help me with sudden wealth management?"  
  * "Advisors that focus on socially responsible investing"  
  * "Which firms have a narrative that mentions a 'holistic approach' to financial planning?"

**Your Roles:** Two specialized AI agents are assigned to this mission. Your roles are distinct, and you must operate strictly within your designated boundaries.

* **ria-hunter-agent (Backend Specialist):** Your sole focus is the ria-hunter repository. You will transform it into a powerful, headless "AI Brain" for the entire application. You are responsible for all data processing, AI logic, database interaction, and API creation. You will not touch the ria-hunter-app repository.  
* **ria-hunter-app-agent (Frontend Specialist):** Your sole focus is the ria-hunter-app repository. You will strip it of all backend logic and transform it into a pure, responsive user interface. You are responsible for all UI components, user interactions, and calling the backend API. You will not touch the ria-hunter repository.

**Operational Protocols & Workflow:**

* **Model Context Protocols (MCPs):** You have access to GithubMCP for repository interactions, SupabaseMCP for database schema verification, and BrowserMCP for end-to-end testing. Use them as required by your assigned tasks.  
* **Version Control:** You will push your changes to GitHub periodically with clear, descriptive commit messages. This ensures our work is saved and versioned.  
* **Deployment:** The Vercel CLI is configured in your environment. After pushing major changes, you will use the Vercel CLI to deploy your respective applications and ensure the deployments succeed in production.  
* **Security & Integrity:**  
  * **Environment Variables are SACROSANCT.** Under no circumstances are you to delete or alter existing environment variables. All necessary API Keys and Secrets are correctly configured and in place.  
  * **The .gitignore file is correctly configured to protect secrets and prevent large files from being committed.** Do not modify it unless explicitly instructed. Your work must not reintroduce previously removed large files to the repository history.

### **2\. Plan for ria-hunter-agent (Backend Specialist)**

YOU ARE THE BEST BACKEND DEVELOPER IN THE WORLD\!

**Primary Goal:** Evolve the ria-hunter repository into a powerful, headless AI service. It will expose a single, intelligent, consolidated API endpoint that handles all complex data querying, natural language understanding, and user management for the entire system.

#### **Step 2.1: Build the Unified "Query Engine" API Endpoint**

This is your most critical task. You will create a new, modern, versioned API endpoint that uses an LLM to deconstruct user queries, replacing the fragile queryParser.ts entirely.

* **Action:** Create a new API route file at ria-hunter/app/api/v1/ria/query/route.ts.  
* **Endpoint Logic:**  
  1. **Receive & Validate the Request:** The endpoint will accept a POST request. The first step is to parse the incoming JSON body, expecting a { "query": "user's question" } structure. Include robust try/catch blocks to handle malformed requests and return a 400 Bad Request error if the body is missing or invalid.  
  2. **Deconstruct the Query with an LLM:** Use the following detailed prompt to call a powerful LLM (e.g., gpt-4o). This will analyze the user's intent and return a structured JSON object.  
     You are a sophisticated financial data analyst API. Your purpose is to deconstruct a user's natural language query about Registered Investment Advisors (RIAs) and transform it into a structured JSON object for a multi-faceted database search. Analyze the user's query: "${userQuery}".

     Your response MUST be a valid JSON object with two top-level keys: "semantic\_query" and "structured\_filters".

     1\. "semantic\_query": This should be an enhanced, semantically rich version of the user's query, suitable for vector database search.  
        \- Correct spelling and grammatical errors (e.g., "Sant Louis" \-\> "Saint Louis").  
        \- Expand abbreviations (e.g., "St." \-\> "Saint", "MO" \-\> "Missouri").  
        \- Clarify intent (e.g., "rias that do private placements" \-\> "Registered Investment Advisors that offer private placement investment opportunities to clients").  
        \- The goal is to create a descriptive phrase that will match well against the 'narrative' embeddings in the database.

     2\. "structured\_filters": This should be a JSON object containing specific, structured data points extracted from the query.  
        \- Valid keys are: "location", "min\_aum", "max\_aum", "services".  
        \- "location": Normalize to "City, ST" format (e.g., "Saint Louis, MO").  
        \- "min\_aum", "max\_aum": Extract numerical values for Assets Under Management.  
        \- "services": Extract specific financial services mentioned, like "private placements", "retirement planning", etc.

     Example User Query: "Show me rias in st louis with over $500m aum that do private placements"

     Your JSON output should be:  
     {  
       "semantic\_query": "Registered Investment Advisors in Saint Louis, Missouri with over $500 million in assets under management that offer private placement services.",  
       "structured\_filters": {  
         "location": "Saint Louis, MO",  
         "min\_aum": 500000000,  
         "max\_aum": null,  
         "services": \["private placements"\]  
       }  
     }

     Return ONLY the raw JSON object. Do not include markdown formatting or any other explanatory text.

  3. **Execute a Hybrid Search Strategy:**  
     * **Vector Search (for Relevance):** Generate an embedding for the semantic\_query string. Call the match\_documents RPC function in Supabase with this embedding to get a list of the most conceptually relevant firms and their cik IDs.  
     * **Structured Filtering (for Precision):** Begin a new Supabase query builder instance. Dynamically build a precise SQL WHERE clause from the structured\_filters object. For example, if location exists, add .ilike('main\_address', '%Saint Louis%') and .ilike('main\_address', '%MO%'). If min\_aum exists, add .gte('aum', 500000000).  
     * **Combine Results:** Use the cik IDs from the vector search to filter your structured query (.in('cik', \[cik\_ids\_from\_vector\_search\])). This ensures your final results are both semantically relevant *and* precisely filtered. Execute this combined query to get the final list of RIA profiles.  
  4. **Implement User Authentication & Onboarding Logic:**  
     * The endpoint must inspect the request headers for an x-user-id.  
     * **If x-user-id is present:** The user is authenticated. Apply the existing logic from checkQueryLimit to check their subscription status and query limits against the user\_queries table.  
     * **If x-user-id is NOT present:** The user is anonymous. To improve onboarding, allow a small number of free queries (e.g., 2-3) before requiring a sign-up. You can track this via IP address or a temporary session identifier. Do not immediately return a 401 error.  
  5. **Enrich and Finalize the API Response:**  
     * Ensure the final JSON response sent to the client is a well-formed array of RIA objects. Each object must include a consistent, linkable identifier (e.g., cik or crd\_number). This is critical for the frontend to build profile links.  
     * Wrap the entire response logic in a final try/catch block to handle unexpected server errors, returning a 500 Internal Server Error status if anything fails.

#### **Step 2.2: Deprecate and Remove Obsolete Code**

To eliminate technical debt, you must remove the old, brittle code.

* **File to Delete:** ria-hunter/lib/queryParser.ts  
* **File to Refactor/Delete:** ria-hunter/app/api/ask/route.ts. Migrate any salvageable logic (like the checkQueryLimit function) to a new shared lib file or directly into your v1 endpoint, then delete this old route file.

#### **Step 2.3: Key Dependencies & Configuration**

Ensure your package.json is correct and your AI provider configuration is robust.

* **AI Model Configuration:**  
  * **Model Names:** Use stable, current model names (e.g., gpt-4o, not gpt-4-turbo-preview).  
  * **Embedding Consistency:** The model used for generating query embeddings (generateQueryEmbedding) **must** be the same model used to create the embeddings stored in the database (Vertex's textembedding-gecko-003). Mismatched models will produce poor vector search results.  
  * **Provider Fallback:** The createAIService logic should be robust. If Vertex/Google credentials are not found, it must gracefully fall back to using the configured OpenAI provider. Log the active provider (OpenAI or Vertex) in production to aid debugging.  
* **Required Libraries:** langchain, @langchain/openai or @langchain/google-genai, @supabase/supabase-js.  
* **Relevant Documentation for ria-hunter-agent:**  
  * **LangChain.js Docs:** [https://js.langchain.com/docs/](https://js.langchain.com/docs/)  
  * **Supabase JavaScript Client Docs:** [https://supabase.com/docs/reference/javascript/introduction](https://supabase.com/docs/reference/javascript/introduction)  
  * **Supabase pgvector for Vector Search:** [https://supabase.com/docs/guides/database/extensions/pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)

#### **Step 2.4: Workflow & Deployment**

1. **Implement Step 2.1:** Build the new endpoint.  
2. **COMMIT POINT 1:** Once the endpoint is functional in a local environment, commit your changes to GitHub with the message: feat: build unified v1 query engine.  
3. **Implement Step 2.2:** Deprecate and remove the old code.  
4. **COMMIT POINT 2:** After removing the old files, commit your changes to GitHub with the message: refactor: deprecate legacy query parser and ask route.  
5. **DEPLOY:** Use the Vercel CLI (vercel deploy \--prod) to deploy the ria-hunter service.  
6. **MONITOR:** Watch the deployment logs for any errors. Provide the final production URL to the ria-hunter-app-agent.

#### **Step 2.5: Troubleshooting Guide for ria-hunter-agent**

* **If the LLM returns an invalid JSON:** Your prompt might be failing. Wrap the LLM call in a try/catch block that specifically attempts JSON.parse(). If it fails, retry the LLM call once or twice. If it still fails, log the raw text output from the LLM and return a 500 error explaining that the query could not be understood.  
* **If Vector Search returns zero results:**  
  1. Check that the embedding model in your code matches the one used to populate the database.  
  2. Use SupabaseMCP to directly call the match\_documents RPC with a known-good query to ensure the function itself is working.  
  3. Log the semantic\_query being sent to the embedding model to ensure it's not empty or nonsensical.  
* **If the final combined query fails:** The issue is likely in your dynamic WHERE clause generation. Log the complete, generated Supabase query string before it's executed. Manually inspect it for syntax errors.

This unified plan provides a clear path to a robust, scalable, and intelligent application. Execute your roles with precision. Begin.