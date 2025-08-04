<!-- 04c_embeddings_and_semantic_index.md -->
# SP-4c — Narrative Embeddings & Semantic Index  
*(GitHub repo : **Turnstyle/ria-hunter** | Username : **Turnstyle**)*  
**Model label :** *Sonnet 4*

---

## Goal  
Generate vector embeddings for each row in `public.narratives`, store them in the `embedding` column (pgvector), create a similarity index, and verify that `/api/ask` can use semantic search when `VertexAI` is available.

---

## AI Agent Instructions (inherits global template)

### Prerequisites  
- `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` configured in `.env.local`.  
- `GOOGLE_APPLICATION_CREDENTIALS_B64` already set **or** a local `gcp-key.json`.  
- `pgvector` extension **enabled** (`create extension if not exists vector;`).  
- A **narratives** table populated by SP-4b (≥ 40 k rows).

### Detailed Task Breakdown  

| # | Action | Example command / file                                                                                                                 |
| - | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | **Install deps** (`vertexai` & pgvector typings) | `npm install @google-cloud/vertexai pgvector`                                                            |
| 2 | **Write embed script** `scripts/embed_narratives.ts` <br>— Batch 500 rows with `embedding is null`, call VertexAI `model.predict()` (textembedding-gecko-002) <br>— Upsert result into `embedding` column (vector (768)) | see § "Sample script skeleton" |
| 3 | **Add index**  | `supabase db remote psql -c "create index if not exists idx_narr_vec on public.narratives using ivfflat (embedding vector_cosine_ops);"` |
| 4 | **Dry-run 1 k rows** | `npx ts-node scripts/embed_narratives.ts --limit 1000` |
| 5 | **Back-fill all** (may take ~20 min) | `npx ts-node scripts/embed_narratives.ts --limit 0` |
| 6 | **Smoke test semantic search** <br>`select crd_number, narrative <br>from public.narratives <br>order by embedding <=> (select embedding('wealth management, st louis')::vector) limit 5;` | `supabase db remote psql -c "...";` |
| 7 | **Update API** (OPTIONAL): if `process.env.VECTOR_SEARCH = 'on'`, query with pgvector similarity before fallback SQL. | modify `app/api/ask/route.ts` |
| 8 | **Local curl test** | `curl -s -X POST http://localhost:3000/api/ask -H 'Content-Type: application/json' -d '{"query":"best wealth manager in MO"}' | jq` |
| 9 | **Commit & PR** | `git checkout -b data/embeddings-semantic`; `git add scripts/ docs/`; `git commit -m "feat: embeddings + pgvector index"` |

#### Sample script skeleton

```ts
// scripts/embed_narratives.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';

const BATCH = parseInt(process.argv[2]?.split('--limit=')[1] || '500', 10);
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const vertex = new VertexAI({ projectId: process.env.GOOGLE_CLOUD_PROJECT });

async function run() {
  const { data } = await supabase
    .from('narratives')
    .select('crd_number,narrative')
    .is('embedding', null)
    .limit(BATCH || 500);

  if (!data?.length) return console.log('✔ No rows left');

  const texts = data.map(d => d.narrative);
  const embeddings = await vertex.matchingEngine()
    .textEmbedding()
    .batchPredict({ instances: texts });

  const rows = data.map((r, i) => ({ ...r, embedding: embeddings[i] }));
  await supabase.from('narratives').upsert(rows, { onConflict: 'crd_number' });
  console.log(`✔ Upserted ${rows.length} rows`);

  if (BATCH) process.exit(0);
}
run().catch(console.error);
```

---

### Troubleshooting Guide  

| Symptom                                   | Cause                               | Fix / Reference                                             |
| ----------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `INVALID_ARGUMENT: project id empty`      | `GOOGLE_CLOUD_PROJECT` unset        | Export env var or rename `GOOGLE_PROJECT_ID` to that key    |
| `permission denied for table narratives`  | Using anon key                      | Use **service-role** key in `.env.local`                    |
| `pgvector not found`                      | Extension missing                   | `create extension vector;` via Supabase SQL editor          |
| Batch > 1000 rows fails                   | VertexAI quota                      | Add `--limit 500`, wait 60 s between calls                  |
| `embedding column wrong type`             | Column TEXT not VECTOR              | `alter table ... alter column embedding type vector(768);`  |

---

### Documentation Links  
- Vertex AI text embeddings — <https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings>  
- Supabase pgvector guide — <https://supabase.com/blog/openai-embeddings-postgres-vector>  
- pgvector operator reference — <https://github.com/pgvector/pgvector#usage>

---

## Status  

*(Append progress notes here — batches processed, row counts, PR URL, etc.)*