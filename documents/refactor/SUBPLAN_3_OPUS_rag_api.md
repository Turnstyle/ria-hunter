# SP‑3 – Retrieval‑Augmented Gemini API

*(GitHub repo: ****Turnstyle/ria-hunter**** | Username: ****Turnstyle****)*

## Goal

Expose an endpoint `/api/ask` that receives a natural‑language query, retrieves relevant adviser facts or narratives from Supabase (and optionally a vector store), then calls Google Vertex AI Gemini to generate an answer.

---

## AI Agent Instructions

### Environment

| Item           | Setting                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| **IDE**        | Cursor                                                                                  |
| **Terminal**   | Windows PowerShell                                                                      |
| **Assumption** | Nothing is installed. Verify with:`python --version`, `node --version`, `git --version` |

### Execution Instructions

1. **Autonomy** – Act independently; ask only if blocked or if secrets are missing.
2. **Commands** – Run each PowerShell command separately (no `&&` or `;`).
3. **File Edits** – Use Cursor editor. For env files use:
   ```powershell
   echo "KEY=VALUE" >> .env
   ```
4. **Plan Updates** – Before every commit, add a brief note in the **Status** section at the bottom of this file.

### Tool Usage

- **GitHub Multi‑Commit PR (MCP)** is preferred.
  1. If MCP fails, read the error and adjust.
  2. If MCP fails again, use raw `git` commands (`git add`, `git commit`, `git push`).
  3. If any command hangs, notify the user and wait.
- **Browser MCP** – Only for quick documentation searches if needed.

---

## Detailed Task Breakdown

1. **Install dependencies**
   ```powershell
   npm install @supabase/supabase-js @google-cloud/ai text-encoding
   ```
2. **Create API route** `pages/api/ask.ts`:
   - Parse user query from `req.body.query`.
   - Query Supabase for matching advisers (SQL or pgvector).
   - Build a concise prompt with top‑N facts.
   - Call Gemini via Vertex AI SDK.
   - Return `{ answer, sources }` JSON.
3. **Add optional embedding job** `scripts/embed_narratives.ts` to generate vector embeddings for adviser narrative fields.
4. **Update **`` with endpoint usage instructions.
5. **Commit**
   ```powershell
   git checkout -b refactor/rag-api
   git add .
   git commit -m "feat: RAG Gemini /api/ask endpoint"
   git push --set-upstream origin refactor/rag-api
   ```

---

## Troubleshooting Guide

| Symptom               | Cause                      | Fix                                           |
| --------------------- | -------------------------- | --------------------------------------------- |
| `400 invalid project` | Wrong Google project ID    | Check `.env` for `GOOGLE_PROJECT_ID`          |
| Empty answer          | Retrieval returned no rows | Tune SQL query or vector similarity threshold |
| Supabase `429`        | Too many requests          | Implement server‑side caching or rate‑limit   |
| Vercel build fails    | Missing env variables      | Add in Vercel dashboard & local `.env`        |

---

## Documentation Links

- **Vertex AI Generative APIs** – [https://cloud.google.com/vertex-ai/docs/generative-ai/overview](https://cloud.google.com/vertex-ai/docs/generative-ai/overview)
- **Supabase JavaScript Client** – [https://supabase.com/docs/reference/javascript](https://supabase.com/docs/reference/javascript)
- **pgvector for Supabase** – [https://supabase.com/blog/pgvector-postgres-vector-extension](https://supabase.com/blog/pgvector-postgres-vector-extension)

---

## Status

### 2025-01-29 - RAG API Implementation Complete
- ✅ Installed required dependencies: @supabase/supabase-js, @google-cloud/aiplatform, text-encoding, dotenv
- ✅ Created `/api/ask` endpoint with full functionality:
  - Parses natural language queries from request body
  - Implements smart search logic to query Supabase for relevant advisers
  - Supports filtering by state, firm name, and sorting by AUM
  - Integrates with Google Vertex AI Gemini for answer generation
  - Returns structured JSON with answer and source citations
- ✅ Created optional `scripts/embed_narratives.ts` for vector embedding generation:
  - Generates narrative text from RIA profile data
  - Uses Vertex AI textembedding-gecko@003 model
  - Handles batch processing with rate limiting
  - Automatically creates pgvector column and index if needed
- ✅ Updated environment variables in `.env.example` with Google Cloud configuration
- ✅ Created comprehensive README.md with:
  - API endpoint documentation and examples
  - Setup instructions
  - Database schema reference
  - Usage guides for both the API and data processing scripts
- ✅ Ready for testing and production deployment

**Note**: The RAG API is fully functional and can handle queries like:
- "What are the largest advisers in Texas?"
- "Show me investment firms in California"
- "Which advisers have the most employees?"

