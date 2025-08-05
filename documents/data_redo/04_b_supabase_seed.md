# SP‑4b – Supabase Seed

*(GitHub repo : ****Turnstyle/ria-hunter**** | Username : ****Turnstyle****)*\
**Model label :** *Sonnet 4*

---

## Goal

Create missing tables and bulk‑load the artefacts produced by SP‑4a (`ria_profiles.csv`, `narratives.json`) into the **production** Supabase project so that `/api/ask` can answer real queries.

---

## AI Agent Instructions (inherits global template)

### Prerequisites

- Ensure you have `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- The two artefacts reside in `../ria-hunter-etl/output/`. Copy or symlink them into `seed/`.

### Detailed Task Breakdown

| # | Action                                                                                                                                                                                      | Example command                                                                                                      |   |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | - |
| 1 | **Install Supabase CLI** (skip if `supabase --version` succeeds)                                                                                                                            | `brew install supabase/tap/supabase-cli`                                                                             |   |
| 2 | **Create tables**  Run DDL via psql or Supabase SQL editor. Use schema below.                                                                                                               | `supabase db remote psql -f seed/schema.sql`                                                                         |   |
| 3 | **Bulk copy CSV**                                                                                                                                                                           | `supabase db remote psql -c "\copy public.ria_profiles FROM 'seed/ria_profiles.csv' WITH (FORMAT csv, HEADER true)"` |   |
| 4 | **Insert narratives**  Use JS admin API for JSON array:                                                                                                                                     | `node seed/load_narratives.mjs`                                                                                      |   |
| 5 | **Verify counts**  `select count(*) from ria_profiles;` expect ≥ 50 000                                                                                                                     |                                                                                                                      |   |
| 6 | **Smoke‑test API**  \`curl -s -X POST [https://ria-hunter.vercel.app/api/ask](https://ria-hunter.vercel.app/api/ask) -H 'Content-Type: application/json' -d '{"query":"largest RIA in TX"}' | jq\`                                                                                                                 |   |
| 7 | Commit seed scripts on `data/seed-2025-08` branch and open PR.                                                                                                                              |                                                                                                                      |   |

### Minimal schema (DDL)

```sql
create table if not exists public.ria_profiles (
  crd_number bigint primary key,
  legal_name text,
  city text,
  state char(2),
  aum numeric,
  form_adv_date date
);

create table if not exists public.narratives (
  crd_number bigint references ria_profiles(crd_number) on delete cascade,
  narrative text,
  embedding vector(384) -- pgvector extension
);
```

### Troubleshooting

| Symptom                                   | Cause                         | Fix                                                          |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `psql: unsupported COPY`                  | file not on server            | Use `supabase storage upload` then `COPY FROM 'https://...'` |
| `error 42501 permission denied for table` | using anon key                | use **service‑role** key                                     |
| `pgvector extension missing`              | Supabase project not migrated | run `create extension if not exists vector;`                 |

---

## Status

*(Append progress notes: timestamps, row counts, PR URL)*

