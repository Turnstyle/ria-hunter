<!-- 04_cors_support.md -->
# SP-4 – Enable CORS for `/api/ask`

*(GitHub repo : **Turnstyle/ria-hunter** | Username : **Turnstyle**)*  

## Goal  
Add proper CORS handling so the front-end (**ria-hunter-app**) can call the back-end **/api/ask** route from any browser without "Redirect is not allowed for a preflight request" errors.

---

## AI Agent Instructions  

### Environment  
| Item | Setting |
|------|---------|
| **IDE** | Cursor |
| **Terminal** | Windows PowerShell |
| **Assumption** | Assume nothing is installed. Verify with:<br>`node --version` · `npm --version` · `git --version` |

### Execution Rules  
1. **Autonomy** – Work independently; ask only if secrets are missing.  
2. **Commands** – Run each PowerShell command **individually** (no `&&` / `;`).  
3. **Edits** – Use Cursor's editor. Keep diffs minimal.  
4. **Status Log** – Append a short note under **Status** (bottom of this file) before every commit.  

### MCP / Git  
- **GitHub Multi-Commit PR (MCP)** is preferred.  
- If MCP fails twice, fall back to raw `git`.  
- Delete the feature branch after merge.

---

## Detailed Task Breakdown  



| # | Task | File / Command |
|---|------|----------------|
| 1 | **Create branch** | `git checkout -b chore/cors-support` |

| 1.5 | Update .env.example in ria-hunter to include CORS_ORIGIN=https://ria-hunter-app.vercel.app  so future devs see the new var.

| 1.8 | Do not check in .env.local; keep it in .gitignore
| 2 | **Add env placeholder** | `echo "CORS_ORIGIN=https://ria-hunter-app.vercel.app" >> .env.example` |
| 3 | **Implement CORS wrapper** | `app/api/ask/route.ts` (patch in place – see snippet) |
| 4 | **Local test** | `npm run dev` then `curl -X OPTIONS -H "Origin: http://localhost:3000" -i http://localhost:3000/api/ask` – expect `204` with 3 CORS headers. |
| 5 | **Unit test** (optional but recommended) | `npm i -D supertest jest` then create `src/__tests__/cors.test.ts` to hit OPTIONS route. |
| 6 | **Commit & push** | `git add .`<br>`git commit -m "chore: add CORS headers and OPTIONS handler"`<br>`git push --set-upstream origin chore/cors-support` |
| 7 | **Open PR via MCP** | Title: **"Enable CORS for /api/ask"** |
| 8 | **After merge – redeploy** | `vercel --prod` (CI will trigger automatically) |

### Code to Inject (`app/api/ask/route.ts`)
```ts
import type { NextRequest } from 'next/server';

// keep edge runtime if already used
export const runtime = 'edge';

const ALLOW_ORIGIN =
  process.env.CORS_ORIGIN ?? '*'; // fallback for local dev
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Handle pre-flight */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Existing POST handler – append CORS + JSON headers */
export async function POST(req: NextRequest) {
  // -------- existing logic below --------
  const { query } = await req.json();
  const { answer, sources } = await handleAsk(query); // <- your helper
  return new Response(JSON.stringify({ answer, sources }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

/* helper kept for illustration */
async function handleAsk(q: string) {
  // ...retrieve data, call Gemini, etc.
  return { answer: 'stub', sources: [] };
}
```

---

## Troubleshooting Guide

| Symptom                 | Cause                                     | Fix                                                                                                           |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **CORS error persists** | Wrong `CORS_ORIGIN` on Vercel             | In Vercel → Settings → Env Vars add `CORS_ORIGIN=https://ria-hunter-app.vercel.app` then redeploy.            |
| **Vercel build fails**  | `process.env` undefined during Edge build | Ensure `.env` vars are present in Vercel and *not* referenced at module top-level other than constants above. |
| **404 /api/ask**        | Route path changed                        | Confirm file still lives at `app/api/ask/route.ts`.                                                           |

---

## Status

1. Created feature branch `chore/cors-support`
2. Updated `.env.example` to include CORS_ORIGIN variable
3. Added CORS headers and OPTIONS handler to the `/api/ask` route 
4. Added unit test for CORS functionality
5. Created PR #4 "Enable CORS for /api/ask"
6. Successfully passed all tests locally
7. Next steps after merge: set CORS_ORIGIN env var on Vercel and redeploy