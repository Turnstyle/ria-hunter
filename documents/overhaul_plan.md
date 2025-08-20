# RIA Hunter Overhaul Plan

**Purpose & Scope**

This document defines a detailed, step‑by‑step plan for overhauling the RIA Hunter project.  It covers both the **backend** (data ingestion, migrations, API design) and **frontend** (user interface, subscription/credits, RAG search) efforts.  It is designed to prevent misalignment between agents, avoid environment misconfiguration issues, and enforce a disciplined workflow.  Progress tracking and bug logging are included so you can monitor completion and identify issues early.  The plan assumes a 2–5 hour work session and uses the tools available via MCPs (GitHub, Supabase, Browser) and CLIs (Vercel, Google Cloud).

---

## 1 High‑level architecture and priorities

- **Architecture:**  
  - Keep the existing separation between the **backend** (Python scripts and Supabase database) and **frontend** (Next.js app).  They share a GitHub repository each (`ria‑hunter` and `ria‑hunter‑app`) but must not overlap responsibilities.  When referencing the codebases or configuring CI/CD, use their **canonical URLs**:  
    - Backend: `https://github.com/Turnstyle/ria-hunter`  
    - Frontend: `https://github.com/Turnstyle/ria-hunter-app`  
    The Supabase project URL is **`https://llusjnpltqxhokycwzry.supabase.co`**; always use this exact URL in environment variables and CLI commands to avoid pointing to another project.
  - The backend exposes REST API endpoints (via Next.js API routes or a lightweight Python API) for the frontend to consume.  
  - The frontend handles user authentication, subscription, credits, and UI/UX, including the RAG search interface.

- **Primary objective:**  
  Implement a **Retrieval‑Augmented Generation (RAG) search** that answers questions like “What are the 10 most active RIAs in Missouri with VC activity and who are their executives?” The data must be cleaned, indexed and accessible via API.  Secondary features (browse and analytics pages) can be addressed after the RAG search works.

- **Design guidelines:**  
  - **No magenta / AI‑goo colours**.  Use a neutral, professional palette.  
  - **Highly responsive UI:** must render cleanly on iPhones and iPads in **portrait** and **landscape** modes.  Use Tailwind responsive classes (`sm:`, `md:`, `lg:`, `xl:`).  
  - **Consistency:** unify colours, typography, spacing via Tailwind configuration or a constants file.

- **Cost‑conscious AI models:**  
  - Default to **Claude 3.7 Sonnet Thinking** for agent tasks.  
  - Upgrade to **Claude 4 Sonnet Thinking** only if context or reasoning limits are encountered.  
  - Reserve **Claude 4 Opus Thinking Max** for exceptional, highly complex tasks.

---

## 2 Tools & protocols

| Tool / Protocol | Usage & restrictions | Notes |
|---|---|---|
| **GitHub MCP** | Used by both backend and frontend agents to fetch files, commit changes and push.  | Ensure branch names reflect the work (e.g. `backend/migrations`, `frontend/rag-ui`).  Always pull latest before pushing. |
| **Supabase MCP** | **Backend only**.  Used for running SQL commands, migrations, loading data.  | *First use requires project verification* (see Section 6).  Do not use from the frontend agent. |
| **Browser MCP** | **Frontend only**.  Used to research styling patterns, Tailwind examples, or third‑party libraries.  | Should not be used for database or backend tasks. |
| **Vercel CLI** | Used by the agent responsible for deployment (likely frontend).  | *First use requires project verification* (see Section 6).  Use `vercel link` to ensure the CLI points to the correct project ID. |
| **Google Cloud CLI** | Backend may need it for Vertex AI embedding jobs if not performed via the code.  | *First use requires project verification*.  Ensure the configured project matches `ria-hunter-backend` before running commands. |

**Note:**  If Dr. (Doctors) role refers to documentation or reference materials, keep it available as read‑only; it is not used for CLIs.

---

## 3 Progress tracking

Maintain two progress logs (one for backend, one for frontend) in a file `overhaul_progress.md` at the root of your planning repository (or in this document if easier).  Each log should contain the tasks listed below with their status and notes.  Example structure:

```markdown
### Backend Progress
| Task ID | Description | Assigned Agent | Status | Notes |
|---|---|---|---|---|
| B1 | Create and run migrations for missing tables | Backend | not started |  |
| B2 | Load sample data and run embedding script | Backend | in progress |  |
…

### Frontend Progress
| Task ID | Description | Assigned Agent | Status | Notes |
|---|---|---|---|---|
| F1 | Remove Sentry integration and clean up repo | Frontend | not started |  |
…

### Bugs & Issues Log
| ID | Component | Description | Severity | Status | Notes |
|---|---|---|---|---|
```

- **Status values:** `not started`, `in progress`, `blocked`, `done`.  
- Update your section immediately after completing a task or discovering an issue.  
- When you ask “What percentage done are we?” the agent will calculate `(completed tasks ÷ total tasks) × 100` for the relevant section.

---

## 4 Backend task list

### B1 – Recreate missing tables & run migrations

1. **Verify Supabase context** (first use of Supabase MCP):  
   - Use the loud handoff pattern to prompt the user to confirm the CLI/MCP is pointed at the **`https://llusjnpltqxhokycwzry.supabase.co`** project.  
   - Once confirmed, proceed to run migration scripts.  
   - If migrations were previously applied partially, run `npx supabase migration list` to see current state.  
 2. **Create tables** using migration files located in the `ria-hunter` repo (e.g. `migrations/20250805_create_core_tables.sql`).  Ensure these tables are created:  
   - **`ria_profiles`**: core table for RIA firms.  Include at minimum:  
     - `id uuid primary key default gen_random_uuid()`  
     - `name text not null` – firm name  
     - `sec_number text unique not null` – SEC identifier (CIK or CRD); use as natural key  
     - `city text`, `state text` – location information normalised to uppercase abbreviations  
     - `aum numeric` – assets under management in USD  
     - `employee_count integer`  
     - `services text[]` – array of advisory services offered  
     - `client_types text[]` – array of client categories (e.g. `individuals`, `institutions`)  
     - `created_at timestamp with time zone default now()`, `updated_at timestamp with time zone default now()` with triggers to update automatically.  
     You may add additional columns (e.g. `ownership_type`, `year_founded`) based on the raw SEC data.
   - **`narratives`**: stores narrative text and embeddings.  Columns:  
     - `id uuid primary key default gen_random_uuid()`  
     - `ria_id uuid references ria_profiles(id) on delete cascade`  
     - `narrative_text text not null`  
     - `embedding vector(D)` – vector column sized to match your embedding dimension (e.g. 384)  
     - `created_at timestamp with time zone default now()`  
     - `updated_at timestamp with time zone default now()`  
   - **`control_persons`**: holds executive and owner information.  Columns:  
     - `id uuid primary key default gen_random_uuid()`  
     - `ria_id uuid references ria_profiles(id) on delete cascade`  
     - `name text not null`  
     - `position text not null`  
     - `ownership_percent numeric`  
     - `email text` (optional; do not store if data is unavailable or sensitive)  
     - `created_at`, `updated_at` timestamps.  
   - **`ria_private_funds`**: captures a firm’s private fund offerings.  Columns:  
     - `id uuid primary key default gen_random_uuid()`  
     - `ria_id uuid references ria_profiles(id) on delete cascade`  
     - `fund_name text not null`  
     - `fund_type text` (e.g. `venture`, `private equity`, `hedge`)  
     - `aum numeric` – assets under management of the fund  
     - `currency text default 'USD'`  
     - `created_at`, `updated_at` timestamps.  
   - `ria_fund_marketers` (if defined).  
   - Indexes for efficient lookups and vector searches.  

  **Row‑level security:**  After creating each table, **enable RLS** (e.g. `ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;`) and define a minimal policy to allow the application to read its own data【646479726250839†L90-L98】.  If RLS is enabled but no policies exist, all access is denied by default, so always add at least one policy to permit reads and inserts for authenticated users【646479726250839†L90-L98】.  Consider separate policies for admin operations vs. user queries.
  Example:  
  ```sql
  alter table narratives enable row level security;
  
  create policy "public read" on narratives
    for select
    using (true);  -- allow reads from any authenticated user
  
  create policy "admin insert" on narratives
    for insert
    with check (auth.role() = 'service_role');  -- restrict inserts to service role
  ```
  Modify the conditions to match your actual roles.  For multi‑tenant data (e.g. users owning only their own documents), include conditions like `auth.uid() = owner_id` in the `using` and `check` clauses.【646479726250839†L90-L98】
  **pgvector and index guidance:**  To enable semantic search you must install the `pgvector` extension (referred to as **`vector`** in Supabase).  We recommend doing this in a migration for repeatability:  
  ```sql
  -- Enable pgvector extension if it doesn't already exist
  create extension if not exists vector;
  ```
  Alternatively, you can enable the extension via the Supabase Dashboard under **Database → Extensions → vector**【412497434558884†L294-L301】.  Once enabled, you gain access to the `vector(N)` data type.  
  
  **Define embedding column:**  Decide on the embedding dimension based on your model.  For example, Vertex AI’s `textembedding‑gecko@003` produces **384‑dimensional** embeddings, while OpenAI’s `text‑embedding‑3‑small` yields **1536 dimensions**.  In the `narratives` table, add an `embedding vector(D)` column where `D` matches your chosen model (e.g. `vector(384)`).  
  
  **Create HNSW index:**  To speed up approximate nearest‑neighbour search, create an **HNSW (Hierarchical Navigable Small World) index** on the embedding column.  Use the inner‑product operator (`vector_ip_ops`) for cosine similarity or `vector_l2_ops` for Euclidean distance.  Example:  
  ```sql
  create index if not exists idx_narratives_embedding_hnsw
    on narratives using hnsw (embedding vector_ip_ops)
    with (m = 4, ef_construction = 10);
  ```
  - **`m`** controls graph connectivity: higher values improve recall but use more memory; typical values are 4, 8 or 16【626353742906121†L78-L100】.  
  - **`ef_construction`** controls index build quality: values between 10 and 200 are common; larger values improve accuracy but increase build time【626353742906121†L78-L100】.  
  You can create the index immediately after the table is defined; HNSW does not require representative data in advance【646479726250839†L74-L83】.  
  
  **Query parameter tuning:**  When executing vector search, tune the runtime parameter `hnsw.ef_search` to control recall vs. latency.  For example:  
  ```sql
  set hnsw.ef_search = 100;  -- good for returning ~100 neighbours
  ```
  Increase `ef_search` when retrieving more than 40 neighbours or when search results seem poor.  Always test queries with `EXPLAIN (ANALYZE)` to confirm the index is used and adjust parameters accordingly【646479726250839†L74-L83】.  
  
  **Filtering & ordering caveats:**  Approximate indexes return approximate results and may be skipped if your query includes complex `WHERE` clauses【412497434558884†L380-L394】.  If you need to filter by metadata (e.g. state = 'MO'), consider a two‑step process:  
  1. Filter using an indexed metadata column to get candidate rows.  
  2. Perform vector similarity search on the smaller subset.  
  Alternatively, set a higher `ef_search` to improve recall when mixing filters.
3. **Create functions** needed for RAG and analytics:  
   - `match_narratives` (vector similarity function).  
   - `compute_vc_activity` (ranking VC activity).  
   - Any additional helper functions defined in later migrations.  
  - When writing functions that combine vector similarity with additional filters (e.g. state = 'MO'), be aware that HNSW indexes return approximate results and may be skipped by the query planner when too many WHERE clauses are added【412497434558884†L380-L394】.  Consider splitting the search into two steps: filter on metadata first, then perform vector search on the subset.
4. **Verify** all tables and functions exist via Supabase MCP queries (`SELECT * FROM information_schema.tables …`).  

### B2 – Data loading and narrative generation

1. **Run ETL pipeline**:  
   - Use scripts `extract_sec.py` and `apply_mappings.py` to parse raw SEC data.  
   - Ensure environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in the environment used by the script.  
   - Use the idempotent upsert logic provided in `load_to_supabase_final.py`.  
2. **Generate narratives**:  
   - Execute `build_narratives.py` to produce the narrative text.  
   - Each narrative should summarise the adviser’s name, location, CRD/SEC number, AUM, employees, services and client types.  
   - Insert or update the narratives in the `narratives` table (without embeddings yet).  
3. **Verify** counts:  
   - Query the `ria_profiles` table to ensure ~40k records loaded.  
   - Query the `narratives` table to confirm there is a narrative for each profile.  

### B3 – Embedding generation

1. **Check AI provider:** confirm `AI_PROVIDER` environment variable is set to `vertex` if cost is a priority.  If not, use `openai`.  
2. **Run `embed_narratives.ts` script** (from the `ria-hunter-app` repo) or a similar Python script to call Vertex AI’s `textembedding-gecko@003`:  
   - Only process narratives where `embedding` is `null`.  
   - Use batch processing (e.g. 50–100 narratives per API call).  
   - Update the `embedding` column for each narrative.  
3. **Verify** that the vector dimension matches `384` and that embeddings are non‑zero.  
   - Sample 5 narratives and compute cosine similarity between related and unrelated ones to check quality.  

  **Embedding dimension considerations:**  Choose an embedding model with as few dimensions as practical; lower dimensions speed up similarity search while often preserving enough semantic information【412497434558884†L380-L394】.  Vertex AI’s `gecko@003` produces 384‑dimensional vectors; OpenAI’s `text-embedding-3-small` produces 1536‑dimensional vectors.  Ensure your vector column size in `narratives` matches the model you use.

  **Embedding generation steps:**
  - **Environment variables**: ensure `GOOGLE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (for Vertex AI) or `OPENAI_API_KEY` (for OpenAI) are available in the environment running the script.  The script will throw an error if these are missing.
  - **Batch size tuning**: choose a batch size that balances throughput and API limits (e.g. 50 for Vertex AI, 100 for OpenAI).  Too large a batch may exceed payload limits or timeouts; too small will result in slower processing.
  - **Data selection**: process only narratives with `embedding IS NULL` to avoid duplicate API calls.  Use pagination or `LIMIT`/`OFFSET` when fetching from the database via Supabase MCP.
  - **Normalization**: if using inner‑product similarity, normalise the embeddings to unit length (the `embed_narratives.ts` script may handle this).  Consistent normalisation ensures correct cosine similarity.
  - **Error handling**: implement retries with exponential backoff for API errors and log failures to the bug log.  

  **Quality verification:**  After embeddings are generated:
  - Query a few known related RIA narratives (e.g. two firms in the same city) and compute their cosine similarity; expect higher values (close to 1).  
  - Compare unrelated firms; expect lower similarity (close to 0).  
  - Use the `hnsw.ef_search` parameter to ensure high recall during these tests.  

### B4 – API design & implementation

1. **Create backend API endpoints** (e.g. in a `/api/rag` folder in the `ria-hunter-app` repo or a separate FastAPI server):  
   - `GET /api/ria/query` – accepts structured filters (`state`, `vc_activity`, etc.) and returns JSON.  
   - `POST /api/ria/search` – accepts a natural language question; calls the planner, retriever and generator modules; returns a final answer.  
   - `GET /api/ria/profile/:id` – returns profile details including executives and funds.  
   - Ensure each endpoint validates JWTs via Supabase Auth (only allow authenticated requests).  

  **Query preprocessing & hybrid search:**  A robust RAG system begins with clean input.  Implement a preprocessing pipeline that performs the following steps:
  - **Normalization:** convert text to lowercase, remove punctuation and normalise whitespace.  This ensures consistent embedding and keyword search【626353742906121†L144-L147】.
  - **Tokenization:** split queries into meaningful tokens; preserve multi‑word entities (e.g. “St. Louis”) by detecting phrases.  
  - **Stopword removal:** for keyword/BM25 search, remove common uninformative words (e.g. “the”, “is”, “of”) to improve ranking.  Skip this for embeddings, as LLM embeddings handle stopwords gracefully.  
  - **Optional spell correction**: implement fuzzy matching or spelling correction if user input is often noisy.  
  After preprocessing, run both **lexical search** (BM25) and **semantic search** (vector similarity) in **parallel**.  Combine results using **reciprocal rank fusion (RRF)** or a weighted sum of scores to balance precision and recall【626353742906121†L109-L124】.  Optionally, re‑rank the top results using a cross‑encoder model for higher accuracy.
  
  **Index parameter tuning:** tune HNSW parameters to trade accuracy for speed.  Typical values: `ef_construction = 100–200` (index build quality) and `m = 16 or 32` (graph connectivity)【626353742906121†L78-L100】.  For search, start with `ef_search = 32` and increase to 64, 128 or higher as needed.  Document these choices in your code so future developers understand the trade‑offs.  Provide an API parameter to override `ef_search` for advanced users.
  
  **API design:** separate endpoints for search and answering:  
  - `POST /api/search` – accepts query string; returns a JSON list of relevant document snippets with metadata (e.g. RIA id, similarity score).  Accepts a parameter like `hybrid=true` to enable combined lexical and semantic search.  
  - `POST /api/answer` – accepts the original question; internally calls `/api/search` to get context; constructs the prompt and calls the chosen LLM; returns the generated answer along with citations.  
  - `GET /api/document/:id` – returns the full document content for a given id so the frontend can display sources on demand.  
  Provide caching and batch endpoints (e.g. `/api/search-batch`) if you anticipate multiple queries or streaming.
2. **Implement query decomposition and context builder**:  
   - Use existing `planner.ts`, `retriever.ts`, `context-builder.ts`, `generator.ts` as a reference.  
   - For the Python backend option, replicate this logic using Python and `openai`/`vertex` APIs.  
3. **Test API endpoints** with curl or Postman:  
   - For `search`, send a query like “Top 10 VC‑active RIAs in Missouri with executive names” and ensure an answer is returned.  
   - For structured queries, test pagination and sorting.  

### B5 – Final backend deployment

1. **Review environment variables** for the backend deployment: ensure the correct `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE` keys and AI provider keys are loaded in Vercel’s project settings.  
2. **Deploy** the backend portion (API routes) via `vercel --prod` from the `ria-hunter-app` repo.  
3. **Check** logs and test endpoints in production.  
4. **Update progress log** to mark backend tasks complete.  

---

## 5 Frontend task list

### F1 – Repository clean‑up and setup

1. **Remove Sentry:** delete `sentry.server.config.js` and any Sentry imports.  
2. **Consolidate codebase:** decide whether to maintain both `ria-hunter-app` and `ria-hunter-standalone` folders.  Unless needed, merge or archive the standalone folder to avoid duplication.  
3. **Clean environment variables:** ensure `.env.local` only includes variables relevant to the project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, `AI_PROVIDER`).  Remove unused or duplicate entries.  
4. **Update Tailwind config:** define colour palette and typography in `tailwind.config.ts` to enforce consistent styling.  Remove any magenta colours.  
5. **Confirm Vercel project:** run `vercel link` to ensure CLI points to the correct project.  Use a loud formatted message for the first run as per Section 6.

### F2 – Implement RAG search UI

1. **Create a search page** (`/app/search/page.tsx`):  
   - Add an input form for the user’s question.  
   - Display a results area with streaming or final answer support.  
   - Show related entities (executives, funds) in a table or list.  
   - For streaming answers, create a hook (e.g. `useStreamingAnswer`) that leverages the `/api/answer` endpoint’s SSE or chunked responses.  Update the UI as chunks arrive and scroll to keep the user informed.  Provide a fallback to non‑streaming responses if streaming is not implemented or fails.  
2. **Integrate with backend API**: use `useApi` or a new hook to call the `/api/ria/search` endpoint.  Client‑side responsibilities include:
   - **Preprocessing**: convert the query to lowercase, trim extra spaces, and optionally remove punctuation.  This ensures consistency with the backend’s preprocessing pipeline【626353742906121†L144-L147】.  Preserve multi‑word entities (e.g. treat “St. Louis” as one phrase) by quoting phrases or using a simple phrase detection algorithm.  
   - **Hybrid flag**: allow the user (or decide automatically) to set `hybrid=true` on the request.  Hybrid search runs lexical and semantic searches in parallel and often improves results for queries that include proper names or specific phrases【626353742906121†L109-L124】.  Provide a toggle in the UI or infer the need for hybrid based on query length (e.g. short queries default to hybrid).  
   - **ef_search parameter**: optionally expose an advanced slider or hidden field to adjust `ef_search` when returning many results.  The default (32–64) should suffice, but advanced users may increase this for better recall at the cost of latency【626353742906121†L78-L100】.  
   - **Result display**: receive an array of document snippets and their similarity scores; render them with collapsible sections or tooltips for citation.  If the question goes to the `/api/answer` endpoint, also display the generated answer and highlight which snippets were used as context.
3. **Credit checking**: call `/api/ask` or implement new logic to decrement credits when a search is executed.  Display remaining credits via the `HeaderCredits` component.  
4. **Loading & error states:** show a spinner and disable the submit button while waiting; display errors gracefully.  
5. **Responsive design:** use Tailwind classes to ensure the search page looks good on small and large screens.  Test on iPhone/iPad simulators in portrait and landscape.

### F3 – Browse page improvements

1. **Use API** `GET /api/ria/query` to fetch paginated lists of RIAs.  
2. **Add filters and sorting** for state, VC activity, AUM, etc.  
3. **Ensure responsive grid/list** that adapts to screen size.  

### F4 – Analytics page (optional phase)

1. **Define metrics** such as number of searches per user, top queries, usage by state.  
2. **Create an `/app/analytics/page.tsx`** that fetches analytics data from a new backend endpoint.  
3. **Use charts** sparingly (e.g. Bar chart) and ensure they scale on mobile.  
4. **Only implement if time permits**.  Focus on RAG search first.

### F5 – Credits, subscription & settings

1. **Review `useCredits.ts`** and fix any synchronization issues with the backend.  Ensure the remaining credit count matches what the backend returns.  
2. **Fix LinkedIn share bonus** if required: either implement the share function or remove references to it until it’s built.  
3. **Settings page:** ensure users can view subscription status and access the Stripe customer portal.  Provide clear upgrade/renew buttons.  
4. **Remove placeholder pages** or mark them clearly as future work.

### F6 – Styling & accessibility

1. **Define a basic style guide** in a `styles/style-guide.md` file (colours, fonts, spacing).  Link it in the README for reference.  
2. **Apply consistent styling**: unify button styles, inputs, and typography across components.  Avoid hard‑coding hex codes; use Tailwind configuration.  
3. **Accessibility checks:** add aria labels to interactive elements, ensure sufficient colour contrast, and manage focus order in modals.  
4. **Testing**: manually test the UI on both iOS orientations and various screen widths.  

### F7 – Final deployment & verification

1. **Check environment variables** in Vercel and ensure they match the correct backend API URL and Supabase project.  
2. **Run `vercel --prod`** to deploy the app.  Use the loud formatting for the first time you run the CLI.  
3. **Verify** that all pages work in production: search returns answers, browse page lists RIAs, credits decrement correctly.  
4. **Update progress log** to mark frontend tasks complete.  
5. **Schedule a CodeRabbit review** on the final codebase.  Run the review once and capture its recommendations in the bug log.  Address critical findings only if time permits.

---

## 6 Handoff & alert patterns

To avoid accidental over‑runs, every explicit handoff must end with a loud, unmistakable alert.  Use the following patterns at the end of an agent’s prompt when a task requires your confirmation or the other agent’s intervention:

### Example: Backend finishing and handing off to frontend

```
************************************************************
***********  HANDOFF REQUIRED – BACKEND FINISHED  ***********
************************************************************

PLEASE STOP HERE!  The backend tasks have been completed up to this point.
Frontend agent, you may now proceed with your next tasks.  Master, please
acknowledge this handoff before continuing!!!
```

### Example: Initial CLI context verification

```
____________________________________________________________
______  INITIAL SUPABASE/Vercel/GCLOUD CLI CONTEXT CHECK  ______
____________________________________________________________

STOP!  Before executing any commands, confirm that the CLI is
pointed at the correct project.  Reply once you have verified
this.  Do not proceed until confirmed!
```

- These messages must be the **last output** in the agent’s prompt when applicable.  
- Do not allow the agent to proceed until you have acknowledged the message.  
- Use similar formatting for any critical warnings (e.g. potential data loss).

---

## 7 Bug & issue handling

- Use the **Bugs & Issues Log** table in the progress tracking file to capture problems.  For each bug, record:  
  - **ID** – unique identifier (e.g. `BUG-001`).  
  - **Component** – where the bug occurs (backend, frontend, CLI, etc.).  
  - **Description** – brief summary of the issue.  
  - **Severity** – `low`, `medium`, `high`, `critical`.  
  - **Status** – `open`, `in progress`, `resolved`.  
  - **Notes** – steps taken or needed to fix.  
- Example entry:  

  ```markdown
  | BUG-001 | Backend | Migration fails due to missing table dependency | high | open | Need to create `control_persons` table first |
  ```
- The goal is to avoid bugs, but if encountered, document them immediately.

---

## 8 Security considerations (minimal)

- **Environment variables:** store secrets in Vercel’s environment variable settings; do not commit them to GitHub.  
- **Row Level Security (RLS):** enable RLS on sensitive tables (`control_persons`); allow read access to authenticated users only.  
- **HTTPS only:** rely on Vercel’s HTTPS endpoints; do not serve insecure content.  
- **JWT validation:** ensure all backend endpoints check for valid Supabase JWT tokens.  
- **Avoid over‑hardening:** no need for advanced security frameworks; these measures are sufficient to deter casual misuse.

---

## 9 Environment configuration

Misconfigured environment variables and project contexts have been a recurring source of bugs.  This section defines the **exact variables and values** to use for each project and environment.  Adapt these to your private keys/secrets but do **not** change the names or Supabase URL.

### 9.1 Global constants

- **Supabase URL:** `https://llusjnpltqxhokycwzry.supabase.co` – use this for all Supabase connections (both backend and frontend).  Never point to another Supabase project.  
- **GitHub repositories:**  
  - Backend: `https://github.com/Turnstyle/ria-hunter`  
  - Frontend: `https://github.com/Turnstyle/ria-hunter-app`
- **Vercel projects:**  When running `vercel link` or `vercel --prod`, ensure the CLI is connected to the correct Vercel project names (e.g. `ria-hunter-backend` and `ria-hunter-app` or your chosen naming).  
- **Common AI provider variables:**  
  - `AI_PROVIDER` – set to `vertex` to use Vertex AI or `openai` to use OpenAI.  
  - `OPENAI_API_KEY` – your OpenAI API key (only if using OpenAI).  
  - `GOOGLE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` – your Google Cloud project ID (`ria-hunter-backend`).  
  - `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS_JSON` – credentials for Vertex AI.  
  - `AI_EMBED_DIM` – optional; set to `384` for Vertex embeddings or `1536` for OpenAI; used to keep table definitions consistent.

### 9.2 Backend project (`ria-hunter`)

**Vercel environment variables** (configure in Vercel dashboard under Environment Variables → Production):

| Variable | Value / Notes |
|---|---|
| `SUPABASE_URL` | `https://llusjnpltqxhokycwzry.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (copy from Supabase → Project Settings → API).  **Do not commit to GitHub.** |
| `SEC_API_BASE_URL` | Base URL for the SEC data (if using external SEC API). |
| `SEC_API_KEY` | Your SEC API key. |
| `AI_PROVIDER` | `vertex` or `openai` – must match your embedding script. |
| `OPENAI_API_KEY` | Only if `AI_PROVIDER=openai`. |
| `GOOGLE_PROJECT_ID` | `ria-hunter-backend` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | JSON string or path to credentials for Vertex AI (if not using default credentials). |
| `SEC_DOCUMENT_LOCATION` | Optional: path for Document AI processor location if using Document AI. |

**Local `.env` file** (checked into repo): Provide an example `.env.example` for developers.  Do not include secret values; use placeholders like `YOUR_SERVICE_ROLE_KEY_HERE`.  For example:

```env
SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
AI_PROVIDER=vertex
GOOGLE_PROJECT_ID=ria-hunter-backend
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64-encoded-json>
SEC_API_BASE_URL=https://api.sec.com
SEC_API_KEY=<your-sec-key>
```

**CLI context:** When running Supabase CLI commands from the backend agent, verify the current project by executing `supabase projects list` and ensure `llusjnpltqxhokycwzry` is selected.  Confirm the service role key has proper privileges.

### 9.3 Frontend project (`ria-hunter-app`)

**Vercel environment variables** (Production):

| Variable | Value / Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://llusjnpltqxhokycwzry.supabase.co` – must match backend. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (copy from Supabase → API).  
| `SUPABASE_SERVICE_ROLE_KEY` | Include only if serverless functions (API routes) need to perform privileged operations. |
| `STRIPE_SECRET_KEY` | Your Stripe secret key for payments. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret. |
| `STRIPE_PRICE_ID` | ID of your subscription price. |
| `NEXT_PUBLIC_APP_URL` | The production URL of the frontend (e.g. `https://ria-hunter.app`). |
| `AI_PROVIDER` | `vertex` or `openai` – should mirror backend. |
| `OPENAI_API_KEY` / `GOOGLE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS_JSON` | As needed for embedding on the server side. |
| `SEC_API_BASE_URL` / `SEC_API_KEY` | Only if the frontend directly calls the SEC API. Normally the backend handles this. |
| `RIA_HUNTER_BACKEND_URL` | Base URL of your deployed backend API if separate (e.g. `https://ria-hunter-app.vercel.app/api`).  In many cases this can be omitted because API routes live in the same Next.js project. |

**Local `.env.local` file**: Each developer should create `.env.local` with the same variables as above.  Provide an `.env.local.example` file with placeholders and instructions.  Example:

```env
NEXT_PUBLIC_SUPABASE_URL=https://llusjnpltqxhokycwzry.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
AI_PROVIDER=vertex
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=<your-stripe-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
STRIPE_PRICE_ID=<price-id>
```

### 9.4 Vercel deployment settings

For each Vercel project (backend and frontend), configure the following under **Settings → Security & Deployment Protection** to match the previous discussion:

- **Deployment Protection:**  
  - Vercel Authentication: **Disabled**.  
  - Password Protection: **Disabled**.  
  - Shareable Links: **None**.  
  - Options Allow List: **Disabled**.  
  - Trusted IPs: **Disabled**.  
  These settings prevent Vercel from adding an authentication layer that would block API routes from returning JSON.  

- **Security Settings:**  
  - Build logs & source protection: **Disabled** (logs remain public).  
  - Git fork protection: **Enabled**.  
  You can leave other advanced security features (e.g. Passwordless Access, Audit logs) untouched.  We focus on minimising friction while preventing unauthorised modifications.

Always double‑check the Vercel CLI is linked to the correct project before deploying.  Use `vercel link` and confirm the project slug matches the expected environment (backend or frontend).  If the CLI is misconfigured, you risk deploying to the wrong project, causing broken API connections.

---

## 10 Final wrap‑up

- After both backend and frontend tasks are marked **done**, and CodeRabbit review is completed, remove the bug log if empty or address any critical bugs.  
- Update the README files in both repositories to reflect the new architecture, environment variables, and deployment steps.  
- Create a release tag or deployment note summarising the changes.  
- Decommission any unused infrastructure (e.g. old Supabase projects, leftover Vercel preview deployments).  
- Celebrate—your RIA Hunter application should now answer queries flawlessly and have a clean, maintainable codebase.

