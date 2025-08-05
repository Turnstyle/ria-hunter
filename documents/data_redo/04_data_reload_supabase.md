# SP‑4 – Data Reload & Supabase Seeding

*(GitHub repo: ****Turnstyle/ria-hunter**** | Username: ****Turnstyle****)*

## Goal

Bring the processed RIA dataset back into Supabase so that `/api/ask` returns real answers.

*We split the work into two sub‑plans:*

| ID    | File                              | Purpose                                                                              | Model Label       |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| SP‑4a | `04a_sec_ingest_and_transform.md` | Re‑download SEC source files, parse, produce `ria_profiles.csv` + `narratives.json`. | **Opus Max Mode** |
| SP‑4b | `04b_supabase_seed.md`            | Create tables, bulk‑import the processed files, verify row counts.                   | *Sonnet 4*        |

> **Back‑end runtime stays untouched** – we only manipulate data.

---

## Shared AI Agent Instructions

### Environment

| Item           | Setting                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **IDE**        | Cursor                                                                                                 |
| **Terminal**   | macOS zsh (user is now on MacBook Pro)                                                                 |
| **Assumption** | Bare system. Verify with: `python3 --version`, `node --version`, `supabase --version`, `git --version` |

### Execution Instructions

1. **Autonomy** – Act independently; ask only if blocked or secrets are missing.
2. **Commands** – Execute each shell command separately (no `&&`).
3. **File Edits** – Use Cursor editor. For env files:
   ```zsh
   echo "KEY=VALUE" >> .env
   ```
4. **Plan Updates** – Log progress in **Status** at bottom of each sub‑plan.

### Tool Usage

- **GitHub MCP** for commits; fall back to raw `git` after two failures.
- **Browser MCP** only for docs lookup.
- **Supabase CLI**: use `supabase db remote` / `supabase functions deploy` if needed.

---

## Troubleshooting Guide (applies to both sub‑plans)

| Symptom                                  | Cause                              | Fix                                                      |
| ---------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `ETIMEDOUT sec.gov`                      | SEC site slow                      | Retry with `--retry 5 --retry-delay 30` in curl/wget     |
| `relation "ria_profiles" does not exist` | Tables not created                 | Run DDL in `04b_supabase_seed.md` step 2                 |
| `supabase auth error 401`                | Wrong service‑role key             | Double‑check `SUPABASE_SERVICE_ROLE_KEY` in env          |
| CSV import stuck at 8 MB                 | psql `\copy` hitting 10k‑row limit | Add `--raw` flag to Supabase CLI or import via dashboard |

---

## Documentation Links

- SEC IAPD Bulk Data – [https://www.sec.gov/large](https://www.sec.gov/large)
- Supabase CSV import – [https://supabase.com/docs/guides/database/sql/copy](https://supabase.com/docs/guides/database/sql/copy)
- Supabase JS Admin – [https://supabase.com/docs/reference/javascript/admin-api](https://supabase.com/docs/reference/javascript/admin-api)

---

## Status

*(Global progress log – sub‑plans keep their own notes)*

