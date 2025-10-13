# Option 1 – Supabase-Centric RAG Revamp & Monorepo Consolidation

This roadmap lets a new agent jump in without scanning the whole repo. It covers two parallel goals:

1. **Stabilise the Supabase-backed RAG backend (Option 1).**
2. **Restructure the codebase into a monorepo with a basic local chat UI.**

All tasks assume credentials live in `.env.local`; do **not** touch that file. If a step absolutely needs manual intervention, it is marked "**Needs Human**" and can wait until everything else is ready.

---

## A. Data Hygiene & Supabase Prep
1. Re-run `scripts/normalize_ria_profiles.js` to keep `ria_profiles` clean. Document in README.
2. Write similar check scripts for:
   - `ria_private_funds` (required columns, fund_type normalisation).
   - `control_persons` (blank titles, obvious duplicates).
   - `mv_firm_activity` refresh verification.
3. Schedule these via Supabase cron (nightly) once scripts exist.

## B. Schema / RPC / Index Audit
1. Confirm pgvector extension version ≥0.6 in production.
2. Verify and, if needed, recreate indexes:
   - `narratives_embedding_vector_hnsw`
   - `ria_private_funds` search indexes (fund_type, crd_number).
   - `mv_firm_activity` indexes (crd_number, state, activity_score).
3. Inspect/repair Supabase functions:
   - `match_narratives`, `hybrid_search_rias`, `hybrid_search_rias_with_string_embedding`.
   - `compute_vc_activity` variants.
4. Refresh materialized views (`mv_firm_activity`) with `REFRESH MATERIALIZED VIEW CONCURRENTLY` and add scripts to automate.

## C. RAG Pipeline Rebuild
1. Choose unified orchestration (LangChain/LlamaIndex). Store in `packages/rag-pipeline`.
2. Implement steps:
   - Input validation + sanitisation.
   - Embedding generation (single provider). Cache results in Supabase `narratives.embedding`.
   - Retrieval via Supabase RPC (vector + hybrid). Include fallbacks.
   - Response synthesis via LLM (OpenAI/Gemini wrapper).
3. Add observability hooks (structured logs per stage).
4. Create unit/integration tests against a Supabase shadow DB.

## D. API Cleanup
1. Rewrite `/api/ask` to call new pipeline; ensure consistent JSON response `{ answer, sources, metadata }`.
2. Merge/retire legacy endpoints (`ask-stream`, `/api/v1/ria/*`) that only forward to the new handler.
3. Harden middleware: rate limits, Supabase auth, error envelopes.
4. Update Jest suites to hit the new pipeline (mock Supabase calls where needed).

## E. Supabase "Extenders"
1. Provision Supabase Edge Function(s) for heavy tasks (re-embedding batches, nightly view refresh).
2. Configure Supabase cron to trigger those functions.
3. Document runbooks: "How to refresh embeddings", "How to rebuild indexes".

## F. Monorepo Restructure & Simple Frontend
1. Introduce Turborepo (or Nx) workspace:
   - `/apps/backend` (current Next.js API, stripped of front-end pages).
   - `/apps/frontend` (new minimal Vite/Next UI).
   - `/packages/shared` (types, rag pipeline, utilities).
2. Update root `package.json` scripts (`dev`, `test`, `lint`) to use Turborepo pipeline.
3. Move current API routes and middleware into `/apps/backend`.
4. Build `/apps/frontend` with a single chat page:
   - Text box + transcript.
   - Calls backend `/api/ask` (no auth, no CORS complexity; same origin).
   - Display answer and sources.
5. Remove old front-end assets/pages once new UI works.

## G. Deployment / Ops
1. Update README with:
   - How to run backend/front-end locally.
   - How to trigger data scripts.
   - How to rerun embeddings & refresh views.
2. Add CI jobs (GitHub Actions): lint, test, export dry-run (optional).
3. Ensure `.env.example` mirrors required vars (sans secrets).

## H. Manual Tasks (**Needs Human**)
1. Provide production Supabase credentials via `.env.local` (already done).
2. Approve creation of Cloud Storage buckets (if needed).
3. Confirm final front-end styling/text (copy tweaks, branding).
4. Approve deployment steps (Vercel / Supabase dashboards) once code is ready.

---

## Status Dashboard Template
- **Data hygiene scripts** – TODO
- **pgvector indexes** – TODO
- **RAG pipeline package** – TODO
- **API rewrite** – TODO
- **Observability/logging** – TODO
- **Monorepo setup** – TODO
- **Simple chat frontend** – TODO
- **Documentation/CI** – TODO
- **Human approvals** – Pending

Keep this section updated as tasks complete.

