<!-- 04a_sec_ingest_and_transform.md -->
# SP‑4a – SEC Ingest & Transform  
*(GitHub repo : **Turnstyle/ria-hunter-etl** | Username : **Turnstyle**)*  
**Model label :** **Opus Max Mode**

---
## Goal
Download the latest SEC IAPD bulk data, extract relevant Form ADV parts, apply existing mapping/validation rules, and emit two artefacts ready for seeding:

* `ria_profiles.csv` – flat table for advisers (≈ 50 k rows)
* `narratives.json` – array of `{crd_number, narrative}` for vector embedding

Both files are written to `output/` in repo root.

---
## AI Agent Instructions (inherits global template)

> **Additional tools for this sub‑plan**
> * **Python 3.11** – preferred for ETL scripts
> * **pandas ≥1.5**, **pyarrow** for fast CSV
> * **rich** for pretty logging (already in requirements.txt)

### Detailed Task Breakdown
| Step | Action |
|------|--------|
| 1 | ‣ `python3 -m venv .venv && source .venv/bin/activate`  |
| 2 | ‣ `pip install -r requirements.txt` (file already exists)  |
| 3 | **Download raw data**  <br>Use `curl -O --retry 5 https://www.sec.gov/files/FOIA/IAPD/Investment_Adviser_Firm_Filing.csv.zip` <br>and the analogous *Private Fund* zip. Save into `raw/` |
| 4 | **Extract & normalise**  <br>`python scripts/extract_sec.py raw/ output/intermediate/`  (script exists; update date parameter to latest YYYYMM) |
| 5 | **Apply mappings**  <br>`python scripts/apply_mappings.py output/intermediate/ docs/refactor/mappings.json output/ria_profiles.csv` |
| 6 | **Generate narratives**  <br>`python scripts/build_narratives.py output/intermediate/ output/narratives.json` |
| 7 | **Validate**  <br>`pytest -q tests/test_validation.py` (should hit 50 pass) |
| 8 | Commit artefacts under `dist/` (not tracked) and log row counts in **Status** section. |

### Troubleshooting (specific to ETL)
| Symptom | Cause | Fix |
|---------|-------|-----|
| CSV zip 0 B | SEC site throttling | add `-A "Mozilla"` header, retry 10x |
| `UnicodeDecodeError` | locale mis‑detected | open file with `encoding="latin1"`, then `.encode('utf‑8')` |
| `KeyError 'cik'` | source header changed | update `mappings.json` synonym list |

---
## Status
*(Add dated log lines, e.g. 2025‑08‑05 – downloaded, row count = 52 123)*

**2025-01-09 – SEC ETL Complete**
- ✓ Downloaded and processed 11 monthly ADV filing directories
- ✓ Extracted 40,651 unique investment advisers
- ✓ Applied mappings to create standardized ria_profiles.csv
- ✓ Generated 40,651 narratives from profile data
- ✓ All validation tests pass (9/9)

**Key Findings:**
- Most firms in dataset have "N" for CRD number (meaning no CRD or not applicable)
- SEC file numbers are present as LEI codes in column 1P
- 37,654 firms (92.6%) have AUM data
- Geographic coverage includes multiple states
- Average narrative length: ~150 characters

**Output Files:**
- `output/ria_profiles.csv` - 40,651 rows, 13 columns
- `output/narratives.json` - 40,651 narrative objects