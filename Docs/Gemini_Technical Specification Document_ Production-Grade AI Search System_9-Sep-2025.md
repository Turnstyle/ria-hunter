

# **Technical Specification Document: Production-Grade AI Search System**

## **I. Executive Summary & System Overview**

### **1.1. Project Mandate**

To architect and implement a production-grade, AI-powered hybrid search system. The system will leverage Google's Gemini 2.0 Flash for advanced query understanding, Supabase with pgvector for efficient retrieval, and will be deployed on Vercel's serverless infrastructure. This document serves as the master technical blueprint for this initiative.

### **1.2. Core Architectural Pillars**

This architecture is founded on four guiding principles to ensure a robust, scalable, and effective system.

* **Security by Design:** The system employs a least-privilege access model for all cloud services, with robust credential management and automated rotation policies to minimize the attack surface.  
* **Performance & Relevance:** The architecture prioritizes low-latency and high-relevance search results. Key performance indicators (KPIs) include a p95 end-to-end latency target of under 250ms and a Normalized Discounted Cumulative Gain (NDCG) greater than 0.9. These targets are achieved through a hybrid retrieval architecture and the sophisticated score-merging technique of Reciprocal Rank Fusion (RRF).  
* **Operational Resilience:** The system is designed for high availability and operational excellence. This includes zero-downtime operational procedures for critical maintenance, such as embedding model migrations, and the implementation of fault tolerance patterns like circuit breakers and intelligent rate limiting to protect against downstream service degradation.  
* **Scalability & Cost-Effectiveness:** The architecture is designed to scale horizontally with user demand while maintaining a predictable and optimized cost profile across Vercel, Supabase, and Google Cloud. Architectural decisions are explicitly weighed against their impact on these interconnected cost models.

### **1.3. C4 Model: Level 1 \- System Context Diagram**

The C4 model provides a hierarchical approach to visualizing software architecture, and the Level 1 System Context diagram offers the highest-level view, establishing the system's scope and its primary interactions with users and external dependencies.1

For this project, the Level 1 diagram situates the **AI Search System** as a single, cohesive unit. The primary actor is the **End User**, who interacts with the system via a **Web Application** hosted on Vercel. This web application, in turn, communicates with the AI Search System's backend logic, which is also deployed as Vercel Serverless Functions.

The diagram clearly delineates the system's external dependencies, which are critical to its operation:

1. **Supabase/PostgreSQL:** This is the primary data persistence and retrieval layer. It is responsible for storing the document corpus, pre-computed text embeddings, and full-text search indexes. The AI Search System queries it for both semantic and keyword-based retrieval.  
2. **Google Vertex AI:** This is the core AI/ML service provider. The system relies on Vertex AI for two distinct functions: generating text embeddings from document content and leveraging the Gemini 2.0 Flash Large Language Model (LLM) for advanced natural language processing tasks, specifically query decomposition.

This context diagram serves as a foundational map for all stakeholders, technical and non-technical, clearly defining what is being built versus what the system interacts with.3

## **II. Foundational Architecture: Security & Infrastructure**

### **2.1. Secure Vertex AI Credential Management in Vercel**

#### **2.1.1. The Vercel-GCP Authentication Challenge**

A secure and robust authentication mechanism between the Vercel serverless environment and Google Cloud Platform (GCP) is paramount. The ideal authentication methods recommended by Google Cloud, such as Workload Identity Federation or attaching a service account directly to a compute resource, are predicated on the client workload having a stable, verifiable identity.5 Vercel's serverless functions, being ephemeral and lacking a persistent, addressable identity within the GCP ecosystem, cannot leverage these preferred mechanisms.6

This architectural constraint necessitates the use of a portable, long-lived credential: a service account JSON key. Google explicitly identifies service account keys as the highest-risk authentication method and strongly advises against their use in production environments due to the risk of exposure and misuse.6 Therefore, the following strategy is not a recommendation but a prescribed set of compensating controls designed to mitigate the inherent risks of this necessary architectural compromise.

#### **2.1.2. Prescribed Mitigation Strategy: Least-Privilege Custom IAM Role**

To counter the risk associated with a long-lived service account key, a dedicated GCP service account will be created exclusively for this application. This service account will be granted a custom Identity and Access Management (IAM) role designed on the principle of least privilege.8

The use of broad, predefined roles like roles/aiplatform.user is strictly prohibited. This role grants over 300 permissions, including extensive create, delete, and update capabilities across the entire Vertex AI surface area, which represents an unacceptable security risk if the key were compromised.8

A new custom IAM role, named VercelAISearchInvoker, will be created. This role will contain only the two permissions essential for the application's function:

1. aiplatform.endpoints.predict: This permission allows the service account to invoke deployed models on Vertex AI Endpoints, which is the mechanism for generating embeddings and receiving responses from Gemini 2.0 Flash.  
2. iam.serviceAccounts.getAccessToken: This permission is required for the service account to generate its own short-lived OAuth2 access tokens, which are used to authenticate the actual API requests.10

By restricting permissions to this minimal set, the potential impact of a compromised credential is dramatically reduced from project-wide administrative access to only the ability to make prediction calls.

#### **2.1.3. Secure Credential Handling and Deployment**

The management of the service account key file requires a meticulous process to prevent accidental exposure.

1. **Base64 Encoding:** Vercel environment variables, like many similar systems, can mishandle multi-line strings such as those found in JSON key files. To ensure integrity, the entire content of the downloaded JSON key file must be Base64 encoded into a single-line string.11 This can be done via the command line:  
   cat /path/to/key.json | base64. Node.js provides native support for decoding Base64 strings, making this a seamless process within the application runtime.12  
2. **Sensitive Environment Variable Storage:** The resulting Base64 encoded string will be stored in the Vercel project settings as an environment variable (e.g., GCP\_SA\_KEY\_BASE64). Crucially, this variable must be marked as "Sensitive".15 This Vercel feature ensures the variable's value is encrypted at rest and is not exposed in deployment logs or the Vercel dashboard UI after being set, providing an essential layer of protection.  
3. **Runtime Initialization:** The Node.js application will read this environment variable at runtime. It will decode the Base64 string back into its original JSON format and parse it into a JavaScript object. This credentials object will be passed directly to the Google Cloud client library constructor (e.g., @google-cloud/aiplatform). This in-memory handling avoids writing the key to the ephemeral file system, which, while temporary, still represents an unnecessary security risk.12

The following Node.js snippet demonstrates the runtime decoding and initialization process:

JavaScript

const { PredictionServiceClient } \= require('@google-cloud/aiplatform');

let predictionServiceClient;

if (process.env.GCP\_SA\_KEY\_BASE64) {  
  const credentialsJson \= Buffer.from(  
    process.env.GCP\_SA\_KEY\_BASE64,  
    "base64"  
  ).toString("utf8");

  const credentials \= JSON.parse(credentialsJson);

  predictionServiceClient \= new PredictionServiceClient({  
    credentials,  
    // The regional endpoint must be specified.  
    // e.g., 'us-central1-aiplatform.googleapis.com'  
    apiEndpoint: process.env.GCP\_API\_ENDPOINT   
  });  
} else {  
  // Handle missing credentials in production  
  throw new Error("GCP service account key is not configured.");  
}

#### **2.1.4. Automated Key Rotation**

To limit the lifespan of any single credential, a mandatory quarterly key rotation policy will be enforced. This process will be automated via a script utilizing the gcloud CLI and the Vercel REST API.17 The script will perform the following actions:

1. Authenticate to GCP with administrative privileges.  
2. Create a new service account key for the designated service account.  
3. Base64 encode the new key.  
4. Use the Vercel API to update the GCP\_SA\_KEY\_BASE64 sensitive environment variable for all relevant environments (production, preview).  
5. After confirming the update, delete the old service account key from GCP.

This automated process ensures that credential rotation is performed consistently and without manual intervention, further strengthening the security posture.

### **2.2. Cost & Resource Modeling**

The system's architecture spans three distinct cloud services, each with a hybrid pricing model that combines a base fee with usage-based overages. A clear understanding of these models is essential for forecasting operational costs and making informed scaling decisions.

The cost model is not a simple sum of independent variables. Architectural decisions, particularly the choice between database-centric and application-centric search logic, create a direct financial trade-off between Supabase and Vercel. A database-centric approach, which performs complex fusion logic in PL/pgSQL, increases the CPU load on the Supabase instance. This may necessitate upgrading to a more expensive compute add-on but could reduce the execution duration of Vercel functions, thereby lowering Vercel's "Active CPU" costs.18 Conversely, an application-centric model shifts this computational load to Vercel Functions, increasing Vercel costs but potentially allowing for a smaller, less expensive Supabase instance. Network latency between Vercel's function region and Supabase's database region also contributes to Vercel's function duration costs, making co-location a critical optimization.20

The following table provides a cost forecast based on three usage scenarios, assuming the recommended application-centric architecture and co-location of services in the same region (e.g., us-east-1).

| Service | Dimension | Low Traffic (100k searches/mo) | Medium Traffic (1M searches/mo) | High Traffic (10M searches/mo) | Pricing Model & Source(s) |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Vercel (Pro Plan)** | Base Fee | $20.00 | $20.00 | $20.00 | Per user, per month 22 |
|  | Edge Requests | Included (10M) | Included (10M) | $0.00 | Overage: $2/1M requests 19 |
|  | Active CPU Time | \~$1.00 | \~$10.00 | \~$100.00 | Overage: \~$5/hour (varies) 23 |
| **Supabase (Pro Plan)** | Base Fee | $25.00 | $25.00 | $25.00 | Per project, per month 18 |
|  | Compute Add-on | Included ($10 credit) | $60.00 (Medium) | $110.00 (Large) | Billed hourly, scales with RAM 18 |
|  | DB Storage (1M docs) | $0.50 (8.5GB) | $0.50 (8.5GB) | $0.50 (8.5GB) | Overage: $0.125/GB 18 |
| **Vertex AI** | Gemini 2.0 Flash | \~$0.10 | \~$1.00 | \~$10.00 | $0.15/1M in, $0.60/1M out tokens 24 |
|  | Embeddings | \~$0.10 | \~$1.00 | \~$10.00 | Varies by model, e.g., \~$0.20/1M tokens |
| **Estimated Total** | **Monthly Cost** | **\~$46.70** | **\~$117.50** | **\~$275.50** | *Excludes data transfer and other minor costs.* |

## **III. Data & Retrieval Architecture: The Search Core**

### **3.1. Architectural Benchmark: Database-Centric vs. Application-Centric Search**

A fundamental architectural decision is where to execute the hybrid search and score fusion logic. This choice has profound implications for system performance, scalability, and long-term maintainability. Two primary patterns are considered:

1. **Database-Centric (PL/pgSQL RPC):** In this model, the Vercel function makes a single remote procedure call (RPC) to a stored function within PostgreSQL. This database function is responsible for executing the vector similarity search, the full-text search, and the Reciprocal Rank Fusion logic, returning a final, ranked list of document IDs to the application layer.  
2. **Application-Centric (Vercel Function Logic):** In this model, the Vercel function acts as an orchestrator. It makes two parallel, independent queries to Supabase—one for vector search and one for full-text search. It then receives the two ranked lists and performs the RRF score fusion within the Node.js runtime before returning the final result.

The optimal choice is non-obvious and requires a detailed trade-off analysis. A naive decision could lead to severe performance bottlenecks under load or introduce significant technical debt in the form of complex, untestable database code. The following table provides a quantitative and qualitative comparison to justify the recommended architecture.

| Metric | Database-Centric (PL/pgSQL RPC) | Application-Centric (Vercel Logic) | Justification & Data Source(s) |
| :---- | :---- | :---- | :---- |
| **p95 Latency** | **Lower.** A single network round-trip between Vercel and Supabase minimizes network overhead. | **Higher.** Requires two parallel database queries, introducing potential for increased latency from connection setup and data transfer. | Network latency between serverless functions and a single-region database is a primary performance consideration.21 |
| **Throughput (QPS)** | **Lower.** Limited by the vertical scalability of the single Supabase database instance. Vector search is highly CPU-intensive. | **Higher.** The computational load of score fusion is distributed across horizontally scalable, stateless Vercel functions. | Vector search performance scales with CPU and memory.26 The application layer can scale out almost infinitely, while the database can only scale up. |
| **Maintainability** | **Low.** PL/pgSQL is a specialized language with limited tooling for unit testing, debugging, and version control compared to modern application languages. | **High.** Logic written in TypeScript/Node.js is easily unit-testable with frameworks like Jest, benefits from static typing, and integrates seamlessly with CI/CD pipelines. | Standard software engineering principles strongly favor keeping complex business logic in the application layer for better maintainability and testability.27 |
| **Cold Start Impact** | **Lower.** A single database connection is established per function invocation. | **Higher.** Requires managing a connection pool or establishing multiple connections, which can exacerbate Vercel function cold start delays.28 | Supabase's provided connection pooler (Supavisor) is designed specifically to mitigate this issue for serverless workloads.29 |
| **Scalability** | **Bottlenecked at the database.** All search load concentrates on the database CPU and memory. | **Horizontally scalable.** The primary bottleneck becomes the database's read capacity, but the fusion logic scales with Vercel's serverless infrastructure. | Vercel Functions are designed for massive concurrency, effectively decoupling the application logic's scalability from the database's.20 |

**Recommendation:** The **application-centric model** is the recommended architecture for this system. While it may incur a marginal latency penalty due to additional network round-trips, its vastly superior scalability, maintainability, and alignment with modern, testable development practices make it the more robust and future-proof choice for a production-grade system. The latency concern can be mitigated by co-locating the Vercel function region with the Supabase project region.

### **3.2. Vector Data Store Configuration (Supabase & pgvector)**

The performance of the entire semantic search capability hinges on the correct configuration of Supabase and the pgvector extension.

#### **3.2.1. Instance Sizing**

The single most critical factor for pgvector query performance is ensuring the Hierarchical Navigable Small World (HNSW) index fits entirely within the database's available RAM.26 An index that resides on disk will result in a catastrophic performance degradation, turning sub-50ms queries into multi-second operations. The Supabase compute instance size will be provisioned based on the following formula:

RAMrequired​\>(Sizevectors​+SizeHNSW​)+SizePG\_Buffers​+SizeConnections​+SizeOS​  
Where:

* SizeHNSW​≈2×Sizevectors​  
* SizePG\_Buffers​≈0.25×RAMtotal​  
* SizeConnections​≈10MB×Numconnections​  
* SizeOS​≈0.15×RAMtotal​

For an initial dataset of 1 million documents with 768-dimension float16 vectors (1.5 KB each), the base vector storage is \~1.5 GB. The HNSW index will require an additional \~3 GB. Accounting for PostgreSQL buffers and OS overhead, a Supabase "Large" compute add-on (8 GB RAM) is the recommended starting point.18

#### **3.2.2. HNSW Index Parameters**

The HNSW index provides an approximate nearest neighbor search that trades perfect accuracy for significant speed improvements. The index will be created with the following statement:  
CREATE INDEX ON documents USING hnsw (embedding vector\_cosine\_ops) WITH (m \= 36, ef\_construction \= 128);

* m: Defines the maximum number of connections per node in the graph. A higher value creates a denser graph, improving recall at the cost of index size and build time.  
* ef\_construction: Controls the size of the dynamic list used during index construction. A higher value leads to a better-quality index but significantly increases build time.  
  The values m=36 and ef\_construction=128 are selected as a balanced starting point based on industry benchmarks.30

#### **3.2.3. Query-Time Parameters**

The ef\_search parameter, set at the session level, controls the size of the search queue during a query. It is the primary lever for tuning the speed-vs-accuracy trade-off at runtime.  
SET LOCAL hnsw.ef\_search \= 100;  
A higher ef\_search value increases accuracy (recall) but also increases query latency. The application layer will implement a dynamic ef\_search strategy:

* **Interactive User Queries:** Use a lower value (e.g., 40\) to prioritize low latency.  
* **Asynchronous/Offline Tasks:** Use a higher value (e.g., 200\) when maximum recall is more important than speed.

#### **3.2.4. Data Types and Dimensionality**

To optimize for storage and memory, embeddings will be stored as float16 instead of the default float32. This can be achieved through quantization or by choosing an embedding model that natively outputs float16 vectors. This change halves the storage and memory footprint of the vectors and the HNSW index with a negligible impact on accuracy (typically \<1%).26

Furthermore, the vector dimensionality will be set to 768\. Research and benchmarks from the MTEB leaderboard demonstrate that there is little correlation between higher dimensionality and better retrieval performance. Many models with 768 or even 384 dimensions outperform the 1536-dimension text-embedding-ada-002 model, while being significantly faster to index and query.31

### **3.3. Hybrid Search System Design**

A hybrid search system combines the strengths of traditional keyword-based search (precision) with modern semantic search (context and meaning) to deliver superior relevance.32

#### **3.3.1. Parallel Indexing Strategy**

The core documents table in PostgreSQL will be equipped with two distinct indexes to facilitate efficient hybrid retrieval:

1. **Full-Text Search Index:** A tsvector column will be maintained, storing the lexically processed text of the document. A Generalized Inverted Index (GIN) will be created on this column, as it is highly optimized for full-text search queries in PostgreSQL.34

   CREATE INDEX idx\_documents\_tsv ON documents USING gin(description\_tsv);  
2. **Semantic Search Index:** The embedding column of type vector will store the dense vector representation of the document's content. An HNSW index, as described in section 3.2.2, will be created on this column to enable fast approximate nearest neighbor search.

#### **3.3.2. Score Fusion with Reciprocal Rank Fusion (RRF)**

Combining the result sets from two disparate search systems is a non-trivial problem. Vector similarity scores (e.g., cosine distance) and full-text relevance scores (e.g., ts\_rank) are on completely different, non-normalized scales. Attempting to combine them with a simple weighted sum is brittle and requires constant tuning.

Reciprocal Rank Fusion (RRF) is chosen as the fusion strategy because it elegantly bypasses this problem. RRF operates on the *rank* of a document within a result set, not its raw score. This makes it inherently normalized and robust to the underlying scoring mechanisms.34 The RRF score for a document

d is calculated as:

RRF\_Score(d)=i=1∑N​k+ranki​(d)1​

where N is the number of result sets, ranki​(d) is the rank of document d in result set i, and k is a constant (typically 60\) that dampens the impact of high ranks.38 If a document does not appear in a result set, its contribution to the sum is zero.  
The fusion logic will be implemented in the Node.js application layer, as per the architectural decision in section 3.1.

#### **3.3.3. PL/pgSQL RRF Function (For Reference/Alternative Implementation)**

While the primary architecture is application-centric, a PL/pgSQL function for calculating an RRF score will be created for benchmarking purposes and to provide an alternative implementation path if required. This function is designed to be used in a larger query that combines results.

SQL

\-- Helper function for calculating the RRF score for a single rank.  
CREATE OR REPLACE FUNCTION rrf\_score(rank bigint, k int DEFAULT 60)  
RETURNS numeric  
LANGUAGE SQL  
IMMUTABLE PARALLEL SAFE  
AS $$  
  \-- If rank is NULL (document not in result set), score is 0\.  
  SELECT COALESCE(1.0 / (rank \+ k), 0.0);  
$$;

A full hybrid search query using this function within the database would leverage Common Table Expressions (CTEs) and the ROW\_NUMBER() window function to first generate ranked lists from each search type, then perform a FULL OUTER JOIN on the document ID to combine them, and finally calculate the total RRF score.34 This approach ensures that documents appearing in either or both lists are correctly scored.

## **IV. Application & AI Logic Layer**

### **4.1. LLM-Powered Query Augmentation with Gemini 2.0 Flash**

Modern search systems must go beyond simple string matching to understand user intent. For complex, multi-faceted queries such as "find me secure laptops under $1500 released after 2023," a single vector search is often insufficient as it conflates semantic concepts with filterable attributes. To address this, the system will leverage the function calling capabilities of Gemini 2.0 Flash to decompose user queries into a core semantic concept and a set of structured metadata filters.

#### **4.1.1. Query Decomposition Strategy**

The Vercel function serving the search request will first route the raw user query to the Gemini 2.0 Flash model. The model will be prompted to analyze the query and, if it identifies structured entities (like prices, dates, or categories), to call a predefined function. This function call will contain the extracted, structured data, which the application can then use to construct a highly specific, filtered query against the database.

#### **4.1.2. Function Calling Schema (tools)**

The interaction with Gemini is guided by a JSON schema that defines the "tools" or functions available to the model. A search\_plan tool will be defined to capture the decomposed query components. This schema acts as a strict contract, ensuring the LLM returns data in a predictable, machine-readable format.40

JSON

const searchPlanTool \= {  
  "name": "search\_plan",  
  "description": "Generates a search plan by extracting a core semantic query and any available structured filters from the user's request.",  
  "parameters": {  
    "type": "object",  
    "properties": {  
      "semantic\_query": {  
        "type": "string",  
        "description": "The essential semantic concept of the user's query, stripped of all filters. E.g., for 'secure laptops under $1500', this would be 'secure laptops'."  
      },  
      "price\_lt": {  
        "type": "number",  
        "description": "The maximum price specified by the user."  
      },  
      "price\_gt": {  
        "type": "number",  
        "description": "The minimum price specified by the user."  
      },  
      "category": {  
        "type": "string",  
        "description": "The product category, if mentioned."  
      },  
      "release\_year\_gt": {  
        "type": "number",  
        "description": "The release year after which products should be considered."  
      }  
    },  
    "required": \["semantic\_query"\]  
  }  
};

#### **4.1.3. Few-Shot Prompting**

To improve the accuracy and reliability of the query decomposition, the prompt sent to Gemini will be a "few-shot" prompt. It will include 2-3 examples of complex user queries paired with the ideal JSON output for the search\_plan function call. This in-context learning guides the model to produce the desired output format and extraction logic without requiring expensive fine-tuning.42

#### **4.1.4. Implementation**

The search endpoint logic will follow this sequence:

1. Receive the raw user query.  
2. Make an initial API call to Gemini 2.0 Flash, providing the query and the searchPlanTool schema.  
3. Inspect the model's response. If it contains a functionCall for search\_plan, parse the arguments from it.  
4. Construct a filtered database query. The semantic\_query from the function call is used to generate a new query embedding. The other arguments (price\_lt, etc.) are translated directly into WHERE clauses in the SQL query.  
5. Execute the hybrid search against Supabase using this augmented query.  
6. If the model does not return a function call, the system falls back to using the original raw query for both semantic and full-text search.

### **4.2. System Resilience and Stability Patterns**

Interacting with external, third-party APIs like Vertex AI introduces potential for latency and failure. A production-grade system must be designed to be resilient to these issues, preventing them from causing cascading failures. This architecture employs two complementary patterns: a reactive circuit breaker and a proactive throttler. This layered defense ensures both high availability and adherence to service limits.

#### **4.2.1. Circuit Breaker for Vertex AI Calls**

All network requests to the Vertex AI API will be wrapped in a circuit breaker using the opossum library for Node.js.45 The circuit breaker pattern monitors the health of an external service. If the service begins to fail (e.g., high error rate, timeouts), the circuit "opens," and subsequent calls fail fast without making a network request. This prevents the application from wasting resources on calls that are likely to fail and gives the downstream service time to recover.

* **Configuration:** The breaker will be configured with aggressive but reasonable defaults:  
  * timeout: 2500: A request taking longer than 2.5 seconds is considered a failure.  
  * errorThresholdPercentage: 25: If 25% of requests fail within the rolling window, the circuit opens.  
  * resetTimeout: 30000: The circuit will remain open for 30 seconds before transitioning to a "half-open" state to test for recovery.  
* **Fallback and Monitoring:** A fallback function will be provided to return a graceful error message to the user. Critically, the open, failure, and fallback events emitted by opossum will be logged and will trigger high-priority alerts in our monitoring system, notifying the on-call engineer of potential Vertex AI service degradation.46

JavaScript

const CircuitBreaker \= require('opossum');

async function callVertexAI(prompt) {  
  // Actual Vertex AI SDK call logic here...  
}

const options \= {  
  timeout: 2500,  
  errorThresholdPercentage: 25,  
  resetTimeout: 30000  
};

const breaker \= new CircuitBreaker(callVertexAI, options);  
breaker.fallback(() \=\> ({ error: 'AI service is temporarily unavailable.' }));  
breaker.on('open', () \=\> console.error('CIRCUIT OPEN: Vertex AI is failing.'));

#### **4.2.2. Intelligent Rate Limiting with Throttling**

Vertex AI, like all cloud services, imposes rate limits on its APIs (e.g., 30,000 online inference requests per minute per project per region).47 Exceeding these limits results in

HTTP 429 Too Many Requests errors. While the circuit breaker reacts to failures, a throttling mechanism proactively prevents them by controlling the rate of outgoing requests.

We will use a durable job queue system like Inngest, which has built-in flow control features.48

* **Implementation:** Instead of calling the Vertex AI API directly, the application will send an event to an Inngest queue (e.g., vertex-ai.request.sent). A dedicated Inngest function will process jobs from this queue. This function will be configured with a throttle setting that respects the Vertex AI quota.  
* **Configuration:** throttle: { limit: 400, period: '1s' }. This configuration smooths out requests, ensuring that no more than 400 jobs are started per second, well within the Vertex AI limit.  
* **Throttling vs. Rate Limiting:** The key advantage of throttling over simple rate limiting is that it is non-lossy. When the rate limit is exceeded, instead of dropping the request, Inngest holds the job in the queue and executes it as soon as capacity becomes available. This ensures that bursts of user activity are handled gracefully without losing requests.49

## **V. Operational Plan: Zero-Downtime Embedding Model Migration**

Upgrading the text embedding model is a critical but high-risk operation. A new model can offer better relevance or efficiency, but migrating a live production database with millions of vectors without service interruption requires a carefully orchestrated, multi-phase process. This playbook ensures a seamless transition with zero downtime.

### **5.1. Phase 1: Schema Evolution (Migration 1\)**

The first step is to prepare the database schema to accommodate the new embeddings.

* **Action:** Execute a database migration that adds a new, nullable column to the documents table. For example, if the current column is embedding, the new column will be embedding\_v2 vector(768) NULL.  
* **Zero-Downtime Justification:** In PostgreSQL versions 11 and later, adding a nullable column with no default value is a metadata-only operation. It does not require a table rewrite or a long-lived ACCESS EXCLUSIVE lock, meaning it can be performed on a live, high-traffic table without blocking reads or writes.50

### **5.2. Phase 2: Asynchronous Backfill (Background Job)**

With the new column in place, the existing corpus must be re-embedded using the new model. Performing this as a single, large batch job would be slow and risky. Instead, a durable job queue will be used for a resilient, asynchronous backfill.

* **Job Queue Selection:** The system will use pg-boss, a robust job queue library that leverages PostgreSQL itself for job storage and coordination.53 This choice avoids introducing an additional external dependency like Redis and benefits from the transactional guarantees of our primary database. It supports features essential for this task, such as automatic retries with exponential backoff and exactly-once delivery semantics.53  
* **Implementation:**  
  1. **Enqueuing Script:** A one-off script will be executed to populate the job queue. It will scan the documents table in batches (e.g., of 10,000) for all rows where embedding\_v2 IS NULL and enqueue jobs containing the document IDs.  
  2. Worker Process: A separate, long-running Node.js worker process will be deployed. This worker will subscribe to the pg-boss queue. For each job, it will:  
     a. Fetch the document text from the database using the provided ID.  
     b. Call the new Vertex AI embedding model to generate the embedding\_v2.  
     c. Update the corresponding row in the documents table with the new vector.  
     The worker will be designed to be idempotent and will handle transient errors from the Vertex AI API via the configured retries in pg-boss.

### **5.3. Phase 3: Dual-Writing & Feature Flagging (Deployment 1\)**

While the backfill process is running, the application must be updated to handle new and updated documents correctly and to prepare for the switchover.

* **Dual-Writing:** The application's data ingestion and update logic will be modified. Whenever a document is created or updated, the system will generate embeddings using *both* the old and the new models and write the results to both the embedding and embedding\_v2 columns. This ensures that all new data is immediately available for both versions of the search system.  
* **Feature Flagging:** A feature flag, use-embedding-v2, will be introduced using a service like Vercel Flags or a third-party provider such as Unleash or Statsig.55 The core search retrieval logic in the application will be wrapped in a conditional block controlled by this flag.  
  JavaScript  
  // Pseudocode for feature-flagged retrieval  
  const useV2 \= await featureFlags.isEnabled('use-embedding-v2', { userId });

  if (useV2) {  
    // Logic to query against the 'embedding\_v2' column  
  } else {  
    // Existing logic to query against the 'embedding' column  
  }

This deployment makes the system ready for the migration without activating it.

### **5.4. Phase 4: Phased Rollout & Cutover (Live Change)**

Once the asynchronous backfill from Phase 2 is 100% complete and the dual-writing logic from Phase 3 has been running stably, the cutover can begin. The feature flag allows for a safe, gradual rollout, minimizing risk.

* **Action:** Using the feature flag management dashboard, the use-embedding-v2 flag will be enabled for a small percentage of users (e.g., 1%).  
* **Monitoring:** The system's performance and relevance KPIs (defined in Table 2\) will be closely monitored for the targeted user segment. Any degradation in latency, error rate, or search relevance will trigger an immediate rollback by disabling the flag.  
* **Gradual Increase:** If the initial rollout is successful, the percentage of users receiving the new embedding model will be gradually increased over several hours or days (e.g., 1% \-\> 10% \-\> 50% \-\> 100%).  
* **Full Cutover:** Once the flag is enabled for 100% of traffic and the system remains stable for a predefined confirmation period (e.g., 24 hours), the migration is considered complete from a user-facing perspective.

### **5.5. Phase 5: Cleanup (Migration 2 & Deployment 2\)**

After the new embedding model has been fully validated in production, the final step is to remove the legacy components to reduce technical debt.

1. **Remove Dual-Writing Logic (Deployment 2):** A new version of the application will be deployed that removes the code for generating and writing to the old embedding column, as well as the feature flag logic. The application will now exclusively use the new model.  
2. **Schema Cleanup (Migration 2):** A final database migration will be executed to drop the old embedding column and rename embedding\_v2 to embedding.  
   SQL  
   ALTER TABLE documents DROP COLUMN embedding;  
   ALTER TABLE documents RENAME COLUMN embedding\_v2 TO embedding;

This completes the migration, leaving the system in a clean, stable state with the new model fully integrated.

## **VI. Implementation Backlog & API Specification**

### **6.1. Ticket-Ready Implementation Backlog**

This backlog is structured into epics and user stories, ready for import into a project management tool.

* **Epic 1: Foundational Setup & Security**  
  * **Story:** Provision Supabase instance, enable pgvector extension, and configure initial database schema.  
  * **Story:** Create a dedicated GCP service account and a custom IAM role (VercelAISearchInvoker) with only aiplatform.endpoints.predict and iam.serviceAccounts.getAccessToken permissions.  
  * **Story:** Implement secure credential handling in the Vercel backend, including Base64 encoding, storage as a "Sensitive" environment variable, and runtime decoding.  
  * **Story:** Develop and schedule an automated quarterly key rotation script using GCP and Vercel APIs.  
* **Epic 2: Core Retrieval Pipeline**  
  * **Story:** Implement the data ingestion pipeline to populate the documents table, including generation of tsvector and initial vector embeddings.  
  * **Story:** Develop the application-centric hybrid search endpoint, fetching results from both FTS and vector search in parallel.  
  * **Story:** Implement the Reciprocal Rank Fusion (RRF) logic in the Node.js application to merge and re-rank the two result sets.  
  * **Story:** Conduct a benchmark study to tune HNSW index parameters (m, ef\_construction) and query-time ef\_search values for the optimal latency/recall trade-off.  
* **Epic 3: LLM Integration & Resilience**  
  * **Story \[LLM-301\]:** Define the Gemini 2.0 Flash function calling schema (search\_plan tool) for query decomposition.  
  * **Story \[LLM-302\]:** Implement the query augmentation logic, including few-shot prompting and handling the model's function call response to build filtered database queries.  
  * **Story:** Wrap all outbound calls to Vertex AI services with an opossum circuit breaker, including fallback logic and alert hooks.  
  * **Story:** Integrate an Inngest function with throttle configuration to manage the rate of calls to the Vertex AI embedding and LLM endpoints.  
* **Epic 4: Zero-Downtime Migration Tooling**  
  * **Story \[MIG-401\]:** Integrate and configure pg-boss into the backend application to enable durable background job processing.  
  * **Story \[MIG-402\]:** Implement a feature flagging service (e.g., Vercel Flags) and wrap the retrieval logic to select between embedding\_v1 and embedding\_v2 columns.  
  * **Story \[MIG-403\]:** Create the one-off script for enqueuing the backfill jobs and the persistent worker process for consuming jobs and generating new embeddings.  
  * **Story \[MIG-404\]:** Create and test the final database migration scripts for adding the new column and for the final cleanup phase (dropping the old column).

### **6.2. API Specification (OpenAPI 3.0)**

The following OpenAPI 3.0 specification defines the contract for the primary search endpoint.57

YAML

openapi: 3.0.0  
info:  
  title: AI Search System API  
  version: 1.0.0  
  description: API for the production-grade hybrid AI search system.  
servers:  
  \- url: /api  
paths:  
  /search:  
    post:  
      summary: Performs a hybrid search  
      operationId: searchDocuments  
      requestBody:  
        required: true  
        content:  
          application/json:  
            schema:  
              type: object  
              properties:  
                query:  
                  type: string  
                  description: The user's natural language search query.  
                  example: "laptops under $1500"  
                limit:  
                  type: integer  
                  description: The maximum number of results to return.  
                  default: 10  
              required:  
                \- query  
      responses:  
        '200':  
          description: Successful search operation  
          content:  
            application/json:  
              schema:  
                type: object  
                properties:  
                  results:  
                    type: array  
                    items:  
                      type: object  
                      properties:  
                        id:  
                          type: string  
                          format: uuid  
                        score:  
                          type: number  
                          description: The final RRF score.  
                        title:  
                          type: string  
                        snippet:  
                          type: string  
                        metadata:  
                          type: object  
        '429':  
          description: Rate limit exceeded or circuit breaker open.  
          content:  
            application/json:  
              schema:  
                type: object  
                properties:  
                  error:  
                    type: string  
                    example: "AI service is temporarily unavailable."  
        '500':  
          description: Internal server error

### **6.3. System Performance & Relevance KPIs**

Benchmarking and continuous monitoring are essential for maintaining a high-quality search experience. The following KPIs will be used to evaluate the system's performance, relevance, and reliability.

| KPI | Definition | Target | Measurement Method |
| :---- | :---- | :---- | :---- |
| **End-to-End Latency (p95)** | Time from user request initiation in the browser to the final response being rendered. | \< 250ms | Vercel Observability and Speed Insights will be used to track this user-centric metric.59 |
| **Retrieval Latency (p95)** | The time taken for the hybrid search query (or queries) to execute within Supabase. | \< 50ms | Supabase Logs and OpenTelemetry traces will provide precise measurements of database performance.26 |
| **Queries Per Second (QPS)** | The number of search requests the system can handle per second at peak load. | \> 500 | Pre-production load testing using tools like k6 or JMeter to simulate peak traffic conditions. |
| **Recall@10** | The percentage of known relevant documents that appear in the top 10 search results for a given query. | \> 95% | Offline evaluation against a manually curated "golden dataset" of queries and their expected relevant documents.60 |
| **NDCG@10** | Normalized Discounted Cumulative Gain at 10 results, measuring the quality of the ranking. | \> 0.9 | Offline evaluation against a dataset with graded relevance scores (e.g., 0=irrelevant, 1=relevant, 2=highly relevant).61 |
| **LLM Error Rate** | The percentage of Gemini API calls that result in an error or are rejected by the circuit breaker. | \< 0.1% | Application-level monitoring and logging, tracking the 'failure' and 'reject' events from the opossum circuit breaker.59 |

## **VII. Annotated Bibliography**

* 5:  
  These documents from Google Cloud outline authentication best practices, explicitly warning against the use of service account keys in production. They formed the basis of our risk assessment and the decision to implement strong compensating controls.  
* 11:  
  This collection of community discussions and guides provided the critical, practical solution of Base64 encoding JSON credentials for use as environment variables in platforms like Vercel, addressing a common deployment challenge.  
* 17:  
  These documents on the Vercel and GCP APIs are foundational for the automated key rotation script, providing the necessary endpoints to programmatically update environment variables and manage service account keys.  
* 8:  
  This set of resources on GCP IAM was essential for defining the least-privilege custom role. 8, in particular, provided a comprehensive list of permissions within  
  roles/aiplatform.user, allowing us to identify and select only the absolute minimum required permissions.  
* 16:  
  This Google Cloud documentation confirmed that the Node.js client libraries can be initialized directly from a parsed JSON credentials object, validating our secure, in-memory credential handling strategy.  
* 6:  
  This GitHub repository provided a crucial analysis of *why* service account keys are often necessary with Vercel—the platform's lack of support for Workload Identity Federation—confirming our approach as a necessary workaround.  
* 15:  
  Vercel's documentation on "Sensitive" environment variables was key to the security strategy, ensuring that the stored credential is encrypted at rest and not exposed in logs.  
* 26:  
  These articles from Supabase and Medium are the cornerstone of the pgvector performance tuning and architectural strategy. They provided quantitative data on memory requirements (HNSW index in RAM), the impact of dimensionality, and the trade-offs for tuning HNSW parameters.  
* 20:  
  These resources on Vercel Functions and Supabase connectivity informed the analysis of network latency and its impact on the database-centric vs. application-centric architectural decision.  
* 27:  
  This Stack Overflow discussion provided the classic software engineering rationale for preferring application-layer logic over stored procedures for complex, evolving business logic, supporting our choice of an application-centric architecture.  
* 34:  
  This collection of articles and documentation provided a deep dive into Reciprocal Rank Fusion (RRF), explaining its superiority over score-based normalization and providing the formula and implementation patterns used in this TSD.  
* 26:  
  These documents on zero-downtime PostgreSQL migrations were instrumental in designing the five-phase embedding model migration plan, particularly in confirming that adding a nullable column is a non-blocking operation.  
* 53:  
  This research on Node.js job queues led to the selection of pg-boss for the embedding backfill process, favoring its use of the existing PostgreSQL database over introducing a new dependency like Redis.  
* 47:  
  These resources on rate limiting and throttling, particularly from Inngest and Google Cloud, provided the foundation for the proactive resilience strategy, distinguishing between lossy rate limiting and non-lossy throttling.  
* 55:  
  These tutorials on feature flagging in Next.js provided the patterns and rationale for using a feature flag to control the phased rollout during the embedding model migration.  
* 40:  
  These official Google documents on Gemini's function calling capabilities were the primary source for designing the query decomposition strategy, including the definition of the tool schema.  
* 42:  
  This set of guides on prompt engineering, specifically few-shot learning, informed the strategy to improve the reliability of the LLM's function call generation by providing in-context examples.  
* 45:  
  The opossum GitHub repository and documentation provided the API details and code examples necessary to implement the circuit breaker pattern for reactive resilience.  
* 53:  
  This collection of articles on AI system benchmarking provided a comprehensive list of potential technical and business KPIs, from which the most relevant metrics for this search system were selected and defined.  
* 18:  
  This extensive set of pricing documents from Vercel, Supabase, and Google Cloud provided the raw data for the cost and resource modeling section.  
* 1:  
  These resources explaining the C4 model for software architecture provided the framework and rationale for using the Level 1 System Context diagram to communicate the system's high-level design.  
* 57:  
  These tutorials on the OpenAPI specification guided the creation of the formal API contract for the /api/search endpoint, ensuring clarity for all developers interacting with the system.

#### **Works cited**

1. C4 model \- Wikipedia, accessed September 9, 2025, [https://en.wikipedia.org/wiki/C4\_model](https://en.wikipedia.org/wiki/C4_model)  
2. C4 model: Home, accessed September 9, 2025, [https://c4model.com/](https://c4model.com/)  
3. The C4 Model for Software Architecture \- InfoQ, accessed September 9, 2025, [https://www.infoq.com/articles/C4-architecture-model/](https://www.infoq.com/articles/C4-architecture-model/)  
4. What is C4 Model? Complete Guide for Software Architecture \- Miro, accessed September 9, 2025, [https://miro.com/diagramming/c4-model-for-software-architecture/](https://miro.com/diagramming/c4-model-for-software-architecture/)  
5. Authentication methods at Google, accessed September 9, 2025, [https://cloud.google.com/docs/authentication](https://cloud.google.com/docs/authentication)  
6. dtinth/google-application-credentials-base64: Writes $GOOGLE\_APPLICATION\_CREDENTIALS\_BASE64 to $GOOGLE\_APPLICATION\_CREDENTIALS if it does not exist. \- GitHub, accessed September 9, 2025, [https://github.com/dtinth/google-application-credentials-base64](https://github.com/dtinth/google-application-credentials-base64)  
7. Best practices for managing API keys | Authentication \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/docs/authentication/api-keys-best-practices](https://cloud.google.com/docs/authentication/api-keys-best-practices)  
8. Vertex AI access control with IAM | Google Cloud, accessed September 9, 2025, [https://cloud.google.com/vertex-ai/docs/general/access-control](https://cloud.google.com/vertex-ai/docs/general/access-control)  
9. GCP Vertex AI \- Cline Docs, accessed September 9, 2025, [https://docs.cline.bot/provider-config/gcp-vertex-ai](https://docs.cline.bot/provider-config/gcp-vertex-ai)  
10. Permission and role issue with Vertex AI \- Custom ML & MLOps \- Google Developer forums, accessed September 9, 2025, [https://discuss.google.dev/t/permission-and-role-issue-with-vertex-ai/183672](https://discuss.google.dev/t/permission-and-role-issue-with-vertex-ai/183672)  
11. Google Cloud Keyfile.json · vercel community · Discussion \#219 \- GitHub, accessed September 9, 2025, [https://github.com/vercel/community/discussions/219](https://github.com/vercel/community/discussions/219)  
12. How do I add Google Application Credentials/Secret to Vercel ..., accessed September 9, 2025, [https://stackoverflow.com/questions/64073209/how-do-i-add-google-application-credentials-secret-to-vercel-deployment](https://stackoverflow.com/questions/64073209/how-do-i-add-google-application-credentials-secret-to-vercel-deployment)  
13. Base64 encoding | Document AI \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/document-ai/docs/base64](https://cloud.google.com/document-ai/docs/base64)  
14. Base64 encode and decode files | Generative AI on Vertex AI \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/vertex-ai/generative-ai/docs/image/base64-encode](https://cloud.google.com/vertex-ai/generative-ai/docs/image/base64-encode)  
15. Sensitive environment variables \- Vercel, accessed September 9, 2025, [https://vercel.com/docs/environment-variables/sensitive-environment-variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)  
16. Authenticate for using client libraries \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/docs/authentication/client-libraries](https://cloud.google.com/docs/authentication/client-libraries)  
17. Using the REST API \- Vercel API Docs, accessed September 9, 2025, [https://vercel.com/docs/rest-api](https://vercel.com/docs/rest-api)  
18. Pricing & Fees | Supabase, accessed September 9, 2025, [https://supabase.com/pricing](https://supabase.com/pricing)  
19. Find a plan to power your projects. \- Vercel, accessed September 9, 2025, [https://vercel.com/pricing](https://vercel.com/pricing)  
20. Vercel Functions, accessed September 9, 2025, [https://vercel.com/docs/functions](https://vercel.com/docs/functions)  
21. Response time from server over 1s : r/Supabase \- Reddit, accessed September 9, 2025, [https://www.reddit.com/r/Supabase/comments/10dpmur/response\_time\_from\_server\_over\_1s/](https://www.reddit.com/r/Supabase/comments/10dpmur/response_time_from_server_over_1s/)  
22. Vercel Pro Plan, accessed September 9, 2025, [https://vercel.com/docs/plans/pro](https://vercel.com/docs/plans/pro)  
23. Breaking down Vercel's 2025 pricing plans quotas and hidden costs \- Flexprice, accessed September 9, 2025, [https://flexprice.io/blog/vercel-pricing-breakdown](https://flexprice.io/blog/vercel-pricing-breakdown)  
24. Google Vertex AI Pricing \- Cost Breakdown & Savings Guide \- Pump.co, accessed September 9, 2025, [https://www.pump.co/blog/google-vertex-ai-pricing](https://www.pump.co/blog/google-vertex-ai-pricing)  
25. Vercel Functions \+ Database Latency, accessed September 9, 2025, [https://db-latency.vercel.app/](https://db-latency.vercel.app/)  
26. Optimizing Vector Search at Scale: Lessons from pgvector ... \- Medium, accessed September 9, 2025, [https://medium.com/@dikhyantkrishnadalai/optimizing-vector-search-at-scale-lessons-from-pgvector-supabase-performance-tuning-ce4ada4ba2ed](https://medium.com/@dikhyantkrishnadalai/optimizing-vector-search-at-scale-lessons-from-pgvector-supabase-performance-tuning-ce4ada4ba2ed)  
27. Business Logic: Database or Application Layer \- Stack Overflow, accessed September 9, 2025, [https://stackoverflow.com/questions/119540/business-logic-database-or-application-layer](https://stackoverflow.com/questions/119540/business-logic-database-or-application-layer)  
28. How can I improve function cold start performance on Vercel?, accessed September 9, 2025, [https://vercel.com/guides/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel](https://vercel.com/guides/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel)  
29. Connect to your database | Supabase Docs, accessed September 9, 2025, [https://supabase.com/docs/guides/database/connecting-to-postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)  
30. pgvector vs Pinecone: cost and performance \- Supabase, accessed September 9, 2025, [https://supabase.com/blog/pgvector-vs-pinecone](https://supabase.com/blog/pgvector-vs-pinecone)  
31. pgvector: Fewer dimensions are better \- Supabase, accessed September 9, 2025, [https://supabase.com/blog/fewer-dimensions-are-better-pgvector](https://supabase.com/blog/fewer-dimensions-are-better-pgvector)  
32. PostgreSQL Hybrid Search Using pgvector and Cohere \- TigerData, accessed September 9, 2025, [https://www.tigerdata.com/blog/postgresql-hybrid-search-using-pgvector-and-cohere](https://www.tigerdata.com/blog/postgresql-hybrid-search-using-pgvector-and-cohere)  
33. Building a Hybrid Search System with Laravel, OpenAI, and PostgreSQL | Andy Brudtkuhl, accessed September 9, 2025, [https://brudtkuhl.com/blog/building-hybrid-search-system-laravel-ai-postgresql/](https://brudtkuhl.com/blog/building-hybrid-search-system-laravel-ai-postgresql/)  
34. Hybrid search with PostgreSQL and pgvector | Jonathan Katz, accessed September 9, 2025, [https://jkatz05.com/post/postgres/hybrid-search-postgres-pgvector/](https://jkatz05.com/post/postgres/hybrid-search-postgres-pgvector/)  
35. Hybrid Search Using Postgres DB \- DZone, accessed September 9, 2025, [https://dzone.com/articles/hybrid-search-using-postgres-db](https://dzone.com/articles/hybrid-search-using-postgres-db)  
36. Hybrid Search Using Reciprocal Rank Fusion in SQL \- SingleStore, accessed September 9, 2025, [https://www.singlestore.com/blog/hybrid-search-using-reciprocal-rank-fusion-in-sql/](https://www.singlestore.com/blog/hybrid-search-using-reciprocal-rank-fusion-in-sql/)  
37. Introducing reciprocal rank fusion for hybrid search \- OpenSearch, accessed September 9, 2025, [https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)  
38. Hybrid search with Postgres Native BM25 and VectorChord, accessed September 9, 2025, [https://blog.vectorchord.ai/hybrid-search-with-postgres-native-bm25-and-vectorchord](https://blog.vectorchord.ai/hybrid-search-with-postgres-native-bm25-and-vectorchord)  
39. Reciprocal rank fusion | Reference \- Elastic, accessed September 9, 2025, [https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)  
40. Function calling with the Gemini API | Google AI for Developers, accessed September 9, 2025, [https://ai.google.dev/gemini-api/docs/function-calling](https://ai.google.dev/gemini-api/docs/function-calling)  
41. Function Calling Guide: Google DeepMind Gemini 2.0 Flash \- Philschmid, accessed September 9, 2025, [https://www.philschmid.de/gemini-function-calling](https://www.philschmid.de/gemini-function-calling)  
42. Few-Shot Prompting | Prompt Engineering Guide, accessed September 9, 2025, [https://www.promptingguide.ai/techniques/fewshot](https://www.promptingguide.ai/techniques/fewshot)  
43. Prompt design strategies | Gemini API | Google AI for Developers, accessed September 9, 2025, [https://ai.google.dev/gemini-api/docs/prompting-strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)  
44. Include few-shot examples | Generative AI on Vertex AI \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/few-shot-examples](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/few-shot-examples)  
45. nodeshift/opossum: Node.js circuit breaker \- fails fast ⚡️ \- GitHub, accessed September 9, 2025, [https://github.com/nodeshift/opossum](https://github.com/nodeshift/opossum)  
46. opossum 8.1.3 | Documentation \- Nodeshift, accessed September 9, 2025, [https://nodeshift.dev/opossum/](https://nodeshift.dev/opossum/)  
47. Vertex AI quotas and limits \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/vertex-ai/docs/quotas](https://cloud.google.com/vertex-ai/docs/quotas)  
48. Understanding the Differences Between Rate Limiting, Debouncing, and Throttling \- Inngest, accessed September 9, 2025, [https://www.inngest.com/blog/rate-limit-debouncing-throttling-explained](https://www.inngest.com/blog/rate-limit-debouncing-throttling-explained)  
49. Throttling \- Inngest Documentation, accessed September 9, 2025, [https://www.inngest.com/docs/guides/throttling](https://www.inngest.com/docs/guides/throttling)  
50. Documentation: 17: ALTER TABLE \- PostgreSQL, accessed September 9, 2025, [https://www.postgresql.org/docs/current/sql-altertable.html](https://www.postgresql.org/docs/current/sql-altertable.html)  
51. How to update your PostgreSQL database without downtime \- Upsun Developer Center, accessed September 9, 2025, [https://devcenter.upsun.com/posts/no-downtime-postgres-updates/](https://devcenter.upsun.com/posts/no-downtime-postgres-updates/)  
52. How to do zero-downtime migration with PostgreSQL? \- Codedamn, accessed September 9, 2025, [https://codedamn.com/news/databases/how-to-do-zero-downtime-migration-with-postgresql](https://codedamn.com/news/databases/how-to-do-zero-downtime-migration-with-postgresql)  
53. timgit/pg-boss: Queueing jobs in Postgres from Node.js like ... \- GitHub, accessed September 9, 2025, [https://github.com/timgit/pg-boss](https://github.com/timgit/pg-boss)  
54. Graphile Worker | Graphile Worker, accessed September 9, 2025, [https://worker.graphile.org/](https://worker.graphile.org/)  
55. How to Implement Feature Flags in Next.js using Unleash, accessed September 9, 2025, [https://docs.getunleash.io/feature-flag-tutorials/nextjs](https://docs.getunleash.io/feature-flag-tutorials/nextjs)  
56. Feature flags in Next.js: How to manage feature rollouts efficiently \- Statsig, accessed September 9, 2025, [https://www.statsig.com/perspectives/feature-flags-nextjs-rollouts](https://www.statsig.com/perspectives/feature-flags-nextjs-rollouts)  
57. OpenAPI 3.0 Tutorial: OpenAPI Specification Definition \- Apidog, accessed September 9, 2025, [https://apidog.com/blog/openapi-specification/](https://apidog.com/blog/openapi-specification/)  
58. OpenAPI Specification \- Swagger, accessed September 9, 2025, [https://swagger.io/resources/open-api/](https://swagger.io/resources/open-api/)  
59. KPIs for gen AI: Measuring your AI success | Google Cloud Blog, accessed September 9, 2025, [https://cloud.google.com/transform/gen-ai-kpis-measuring-ai-success-deep-dive](https://cloud.google.com/transform/gen-ai-kpis-measuring-ai-success-deep-dive)  
60. Accelerate HNSW indexing and searching with pgvector on Amazon Aurora PostgreSQL-compatible edition and Amazon RDS for PostgreSQL | AWS Database Blog, accessed September 9, 2025, [https://aws.amazon.com/blogs/database/accelerate-hnsw-indexing-and-searching-with-pgvector-on-amazon-aurora-postgresql-compatible-edition-and-amazon-rds-for-postgresql/](https://aws.amazon.com/blogs/database/accelerate-hnsw-indexing-and-searching-with-pgvector-on-amazon-aurora-postgresql-compatible-edition-and-amazon-rds-for-postgresql/)  
61. 17 Essential KPIs for Evaluating AI Benchmarks in 2025 \- ChatBench, accessed September 9, 2025, [https://www.chatbench.org/what-are-the-key-performance-indicators-for-evaluating-ai-benchmarks-in-competitive-ai-solutions/](https://www.chatbench.org/what-are-the-key-performance-indicators-for-evaluating-ai-benchmarks-in-competitive-ai-solutions/)  
62. Add a multiline environment variable to Vercel (or Heroku) \- Ye Joo Park's Blog, accessed September 9, 2025, [https://park.is/blog\_posts/20210118\_add\_a\_multiline\_env\_variable\_to\_vercel/](https://park.is/blog_posts/20210118_add_a_multiline_env_variable_to_vercel/)  
63. Add Vercel Environment Variable that points to JSON file \- Stack Overflow, accessed September 9, 2025, [https://stackoverflow.com/questions/75044120/add-vercel-environment-variable-that-points-to-json-file](https://stackoverflow.com/questions/75044120/add-vercel-environment-variable-that-points-to-json-file)  
64. Deploying Google Cloud Platform Credentials to Koyeb \- DEV Community, accessed September 9, 2025, [https://dev.to/kylewelsby/deploying-google-cloud-platform-credentials-to-koyeb-463l](https://dev.to/kylewelsby/deploying-google-cloud-platform-credentials-to-koyeb-463l)  
65. Replace Vercel Blob with Google Cloud Storage | Front End Engineering, accessed September 9, 2025, [https://www.frontendeng.dev/blog/14-replace-vercel-blog-with-google-cloud-storage](https://www.frontendeng.dev/blog/14-replace-vercel-blog-with-google-cloud-storage)  
66. Environment Variables \- Vercel API Docs, accessed September 9, 2025, [https://vercel.com/docs/rest-api/reference/examples/environment-variables](https://vercel.com/docs/rest-api/reference/examples/environment-variables)  
67. Manage access to a Vertex AI Workbench instance \- Google Cloud, accessed September 9, 2025, [https://cloud.google.com/vertex-ai/docs/workbench/instances/manage-access](https://cloud.google.com/vertex-ai/docs/workbench/instances/manage-access)  
68. Vertex AI \- Permissions Reference for Google Cloud IAM, accessed September 9, 2025, [https://gcp.permissions.cloud/iam/aiplatform](https://gcp.permissions.cloud/iam/aiplatform)  
69. Accessing Anthropic vertex ai using service account \- Google Developer forums, accessed September 9, 2025, [https://discuss.google.dev/t/accessing-anthropic-vertex-ai-using-service-account/185386](https://discuss.google.dev/t/accessing-anthropic-vertex-ai-using-service-account/185386)  
70. pgvector 0.4.0 performance \- Supabase, accessed September 9, 2025, [https://supabase.com/blog/pgvector-performance](https://supabase.com/blog/pgvector-performance)  
71. googleapis/google-cloud-node: Google Cloud Client ... \- GitHub, accessed September 9, 2025, [https://github.com/googleapis/google-cloud-node](https://github.com/googleapis/google-cloud-node)  
72. Haystack EU 2023 \- Philipp Krenn: Reciprocal Rank Fusion (RRF) \- How to Stop Worrying about Boosting \- YouTube, accessed September 9, 2025, [https://www.youtube.com/watch?v=px4YBYrz0NU](https://www.youtube.com/watch?v=px4YBYrz0NU)  
73. How I Achieved Zero Downtime in Advanced SQL Data Migrations Using PostgreSQL and Python | by Satyam Sahu \- Medium, accessed September 9, 2025, [https://medium.com/learning-sql/how-i-achieved-zero-downtime-in-advanced-sql-data-migrations-using-postgresql-and-python-168650e8cfe5](https://medium.com/learning-sql/how-i-achieved-zero-downtime-in-advanced-sql-data-migrations-using-postgresql-and-python-168650e8cfe5)  
74. Add column to huge table in Postgresql without downtime \- Stack Overflow, accessed September 9, 2025, [https://stackoverflow.com/questions/36694517/add-column-to-huge-table-in-postgresql-without-downtime](https://stackoverflow.com/questions/36694517/add-column-to-huge-table-in-postgresql-without-downtime)  
75. Building a Job Queue System with Node.js, Bull, and Neon Postgres \- Neon Guides, accessed September 9, 2025, [https://neon.com/guides/nodejs-queue-system](https://neon.com/guides/nodejs-queue-system)  
76. bee-queue/bee-queue: A simple, fast, robust job/task queue for Node.js, backed by Redis. \- GitHub, accessed September 9, 2025, [https://github.com/bee-queue/bee-queue](https://github.com/bee-queue/bee-queue)  
77. BullMQ \- Background Jobs processing and message queue for NodeJS | BullMQ, accessed September 9, 2025, [https://bullmq.io/](https://bullmq.io/)  
78. Rate limits | Gemini API | Google AI for Developers, accessed September 9, 2025, [https://ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)  
79. Rate limits and quotas | Firebase AI Logic \- Google, accessed September 9, 2025, [https://firebase.google.com/docs/ai-logic/quotas](https://firebase.google.com/docs/ai-logic/quotas)  
80. Integrating Feature Flags in Next.JS React Applications \- Harness, accessed September 9, 2025, [https://www.harness.io/blog/integrating-feature-flags-in-nextjs-react-applications](https://www.harness.io/blog/integrating-feature-flags-in-nextjs-react-applications)  
81. How to set up Next.js analytics, feature flags, and more \- PostHog, accessed September 9, 2025, [https://posthog.com/tutorials/nextjs-analytics](https://posthog.com/tutorials/nextjs-analytics)  
82. Using Feature Flags in a Next.js Application | ConfigCat Blog, accessed September 9, 2025, [https://configcat.com/blog/2022/04/22/how-to-use-feature-flags-in-nextjs/](https://configcat.com/blog/2022/04/22/how-to-use-feature-flags-in-nextjs/)  
83. Function calling using the Gemini API | Firebase AI Logic \- Google, accessed September 9, 2025, [https://firebase.google.com/docs/ai-logic/function-calling](https://firebase.google.com/docs/ai-logic/function-calling)  
84. Gemini API quickstart | Google AI for Developers, accessed September 9, 2025, [https://ai.google.dev/gemini-api/docs/quickstart](https://ai.google.dev/gemini-api/docs/quickstart)  
85. Gemini 2.0 Flash | Generative AI on Vertex AI | Google Cloud, accessed September 9, 2025, [https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-0-flash](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-0-flash)  
86. Files API | Gemini API | Google AI for Developers, accessed September 9, 2025, [https://ai.google.dev/gemini-api/docs/files](https://ai.google.dev/gemini-api/docs/files)  
87. Analyze performance \- Azure AI Search | Microsoft Learn, accessed September 9, 2025, [https://learn.microsoft.com/en-us/azure/search/search-performance-analysis](https://learn.microsoft.com/en-us/azure/search/search-performance-analysis)  
88. Measures that Matter: Correlation of Technical AI Metrics with Business Outcomes \- Medium, accessed September 9, 2025, [https://medium.com/@adnanmasood/measures-that-matter-correlation-of-technical-ai-metrics-with-business-outcomes-b4a3b4a595ca](https://medium.com/@adnanmasood/measures-that-matter-correlation-of-technical-ai-metrics-with-business-outcomes-b4a3b4a595ca)  
89. Top AI Search Metrics You Need to Measure Success | O8, accessed September 9, 2025, [https://www.o8.agency/blog/ai/ai-search-metrics](https://www.o8.agency/blog/ai/ai-search-metrics)  
90. How to Measure AI Performance: Key Metrics and Best Practices \- Neontri, accessed September 9, 2025, [https://neontri.com/blog/measure-ai-performance/](https://neontri.com/blog/measure-ai-performance/)  
91. Vertex AI Pricing Review \+ Features and an Alternative | 2025 \- Lindy, accessed September 9, 2025, [https://www.lindy.ai/blog/vertex-ai-pricing](https://www.lindy.ai/blog/vertex-ai-pricing)  
92. Google Cloud Vertex AI Pricing Review 2025: Plans & Costs \- Tekpon, accessed September 9, 2025, [https://tekpon.com/software/google-cloud-vertex-ai/pricing/](https://tekpon.com/software/google-cloud-vertex-ai/pricing/)  
93. Gemini Developer API Pricing | Gemini API | Google AI for Developers, accessed September 9, 2025, [https://ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)  
94. Vertex AI Model Garden \- Google Cloud Console, accessed September 9, 2025, [https://console.cloud.google.com/vertex-ai/model-garden](https://console.cloud.google.com/vertex-ai/model-garden)  
95. The Complete Guide to Supabase Pricing Models and Cost Optimization \- Flexprice, accessed September 9, 2025, [https://flexprice.io/blog/supabase-pricing-breakdown](https://flexprice.io/blog/supabase-pricing-breakdown)  
96. The True Cost of Supabase: Pricing, Integration & Maintenance Guide | MetaCTO, accessed September 9, 2025, [https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)  
97. Supabase Pricing: What You Really Need to Know \- Supadex, accessed September 9, 2025, [https://www.supadex.app/blog/supabase-pricing-what-you-really-need-to-know](https://www.supadex.app/blog/supabase-pricing-what-you-really-need-to-know)  
98. Supabase pricing model: How it works and how Orb helped, accessed September 9, 2025, [https://www.withorb.com/blog/supabase-pricing](https://www.withorb.com/blog/supabase-pricing)  
99. Supabase Pricing in 2025: Full Breakdown of Plans | UI Bakery Blog, accessed September 9, 2025, [https://uibakery.io/blog/supabase-pricing](https://uibakery.io/blog/supabase-pricing)  
100. Plans and Pricing \- V0, accessed September 9, 2025, [https://v0.app/pricing](https://v0.app/pricing)  
101. Vercel Hobby Plan, accessed September 9, 2025, [https://vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby)  
102. How to Create Software Architecture Diagrams Using the C4 Model \- freeCodeCamp, accessed September 9, 2025, [https://www.freecodecamp.org/news/how-to-create-software-architecture-diagrams-using-the-c4-model/](https://www.freecodecamp.org/news/how-to-create-software-architecture-diagrams-using-the-c4-model/)  
103. C4 model | Lightweight standard for visualizing software architecture, accessed September 9, 2025, [https://c4model.info/](https://c4model.info/)  
104. Chapter 5: Step-by-step OpenAPI code tutorial \- Idratherbewriting.com, accessed September 9, 2025, [https://idratherbewriting.com/learnapidoc/openapi\_tutorial.html](https://idratherbewriting.com/learnapidoc/openapi_tutorial.html)