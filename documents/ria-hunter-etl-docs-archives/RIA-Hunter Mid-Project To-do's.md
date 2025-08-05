RIA Hunter: Project Management & Tracking  
(Last Updated: {{{{datetime_iso_string}}}}) <!-- Will be replaced by current timestamp -->

## **To-do's**

This section outlines the tasks that still need to be accomplished.

**Project Setup & Initial Configuration:**

* \[ \] Configure .env.local in AppFoundation with all necessary API keys and environment variables (Supabase URL & Anon Key, Auth0, Google Gemini, Chroma (if used)).  
* \[ \] Establish initial Supabase database schema based on Merged Table 4 (Base Schema).  
  * **Note:** Dependent on Supabase project status (was observed to be "restoring"). Confirm project availability and suitability, or create a new one and update credentials.  
* \[ \] Confirm Auth0 integration (libs/auth) is functional for the new ria-hunter app.  
* \[ \] Set up initial CI/CD workflows (GitHub Actions) for both repositories as outlined in Section 8.5.

**SEC IAPD Bulk Data ETL Pipeline Development (within ria-hunter-etl repo):**

* \[x] Develop Python scripts for downloading SEC Historical CSV Data (including all schedules).
    * **Status:** All locally available ZIP files downloaded by the user are considered sufficient. No further download development needed for these sources.
* \[x] Implement CSV parsing logic (using pandas) for Form ADV Part 1A and all relevant schedules (especially Schedule D).
    * **Status:** Initial implementation of `transform_schedule_d_csvs` in `src/etl/transform.py` added. It processes `IA_ADV_Base_A_*.csv` and `IA_Schedule_D_7B1_*.csv`. Integrated into `process_extracted_feed_data`.
    * **Needs Refinement:** CRD to CIK mapping, comprehensive column mapping for all relevant CSVs, robust filing date determination, and handling of various Schedule D files.
* \[ \] Develop data linking logic to combine multiple CSV tables using CRD numbers.
    * **Note:** `transform_schedule_d_csvs` uses 'Firm Crd Nb' as a 'cik' placeholder. True linking and CRD to CIK mapping is pending.
* \[ \] Implement data cleaning and transformation routines for SEC data (development of src/etl/transform.py for .xlsx data is a key next step).
    * **Status:** `transform_monthly_iapd_xlsx` exists. `parse_adv_xml_file` and `transform_schedule_d_csvs` added for XML and CSV. Core cleaning functions like `clean_dataframe_columns` and `normalize_text` are used.
    * **Needs Refinement:** Comprehensive data type handling, specific cleaning rules per data source/field.
* \[N/A] Define and implement logic within the ETL process to filter and retain Form ADV data filed from January 1, 2020, to the present.
    * **Note:** This filtering is no longer required in the ETL pipeline. AppFoundation will handle any necessary date filtering on the raw data loaded.
* \[x] Develop scripts to load processed SEC data into Supabase tables, implementing an "upsert" logic.
    * **Status:** `load.py` functions (`load_advisers`, `load_filings`, `load_private_funds`) use upsert logic. (Time scope constraint removed).
* \[x] Create a comprehensive list of USPS ZIP codes for all St. Louis MSA counties and integrate for geographic filtering.
    * **Status:** `src/etl/geography.py` updated with Missouri ZIP codes. Locally available data is considered sufficient. No further ZIP code research required.
* \[x] Write unit tests for ETL scripts (parsing, transformation, loading logic).
    * **Status:** Initial unit tests added for `src/etl/geography.py` (is_st_louis_msa_zip), `src/etl/load.py` (clean_value), and `src/etl/transform.py` (parse_date_from_feed_name, clean_dataframe_columns). Tests are passing.
    * **Needs Expansion:** Cover main transformation functions (XLSX, XML, CSV processing), data loading functions, and extraction functions.
* \[x] Implement the main control flow in src/main.py to iterate through required years/periods and orchestrate the ETL process.
    * **Status:** `src/main.py` refactored to include `run_single_xml_feed_etl()` and `run_monthly_iapd_zips_etl()`. The main `run_etl_pipeline()` calls these. It processes available feeds.
    * **Needs Refinement:** Iteration for specific historical years/periods if required beyond discovered feeds. Logic for Schedule D CSV specific ETL flow is present but might need activation/refinement based on `SCHEDULE_D_CSV_URL`.

**Core Application Backend Development (Next.js API Routes within AppFoundation):**

* \[ \] Implement API route (GET /api/ria-hunter/search) for core RIA search functionality (querying Supabase).  
* \[ \] Implement robust error handling and logging for all API routes.  
* \[ \] Integrate Zod for request and response validation in API routes.  
* \[ \] Write unit/integration tests for API routes.

**Core Application Frontend Development (jtpnexus-website / ria-hunter app):**

* \[ \] Develop the results display table with pagination and sortable columns on jtpnexus-website.  
* \[ \] Create the detailed RIA profile page on jtpnexus-website to display information from Supabase.  
* \[ \] Fully implement core chatbot functionality on jtpnexus-website:  
  * Sending user's query to AppFoundation.  
  * Receiving and displaying results from AppFoundation.  
* \[ \] Integrate jtpnexus-website with AppFoundation for RIA Hunter query processing.  
* \[ \] Implement production-ready backend for API routes in jtpnexus-website:  
  * /api/ria-hunter-waitlist: Integrate with Supabase for data storage and implement email notifications (currently logs to console and is bypassed by a Google Apps Script).  
  * /api/save-form-data: Modify to use persistent storage instead of a local text file.  
* \[ \] Implement User Authentication ("Sign Up / Login") on jtpnexus-website.  
* \[ \] Implement "Contact Sales" functionality on jtpnexus-website.  
* \[ \] Leverage AppFoundation's libs/ui-shared for consistent UI components in the ria-hunter app frontend (if applicable, clarify if jtpnexus-website fulfills this or if there's a separate frontend within AppFoundation).  
* \[ \] Write unit/component tests for key frontend components on jtpnexus-website.

**"Living Profile" Enhancement Development (within AppFoundation & Supabase):**

* \[ \] Extend Supabase schema as per Merged Table 4 (Expanded for Living Profile) for user notes, tags, links, and metadata.  
* \[ \] Implement Supabase Row Level Security (RLS) policies for user-specific data.  
* \[ \] Develop backend API routes for CRUD operations on user notes, tags, links, and metadata.  
* \[ \] Design and implement frontend UI sections on the RIA profile page for displaying and managing user-specific content.

**"Investment Thesis Matcher" Enhancement Development (Phased \- ETL in ria-hunter-etl, Frontend/API in AppFoundation):**

* **Phase 1: Narrative Extraction & Basic Matching**  
  * \[ \] Enhance ETL pipeline (in ria-hunter-etl) to extract and store narrative text (Form ADV Part 2A, Schedule D "Miscellaneous") from filings into Supabase (see Merged Table 4 additions). (Time scope constraint removed)
  * \[ \] Develop backend API route (POST /api/ria-hunter/match-thesis in AppFoundation) for thesis input.  
  * \[ \] Implement initial keyword/phrase matching logic against stored narrative text.  
  * \[ \] Design and implement frontend UI for thesis input and display of basic match results (including highlighted text).  
* **Phase 2: Embedding-based Semantic Search**  
  * \[ \] Integrate Google Gemini API (via libs/ai-services in AppFoundation and server-side proxy) for generating text embeddings from narrative snippets and user theses. (Time scope constraint removed for narrative snippets)
  * \[ \] Set up vector storage and search:  
    * Option A: Configure and use Chroma Cloud/DB (via libs/ai-services).  
    * Option B: Enable and use pgvector extension in Supabase (update schema in Merged Table 4 for ria\_narrative\_embeddings).  
  * \[ \] Develop batch process (in ria-hunter-etl) for generating and storing embeddings for RIA narrative data. (Time scope constraint removed)
  * \[ \] Update thesis matching API route to use semantic search (cosine similarity) against embeddings.  
  * \[ \] Refine frontend display to show semantic match explanations.

**Testing, Deployment, and Documentation:**

* \[ \] Conduct thorough testing of all features (ETL, core search, Living Profile, Investment Thesis Matcher).
* \[ \] Perform UI/UX testing with a focus on the non-technical user experience.  
* \[ \] Prepare for deployment on Vercel (jtpnexus.com/ria-hunter).  
* \[ \] Finalize all technical documentation (including README.md for ria-hunter-etl detailing CI/CD setup) and user guides.
* \[ \] Implement strategies for ongoing cost monitoring, especially for AI services.  
* \[ \] Fully implement "produce-section" and "jobsparc" features on jtpnexus-website.

## **In Progress To-do's**

(Items moved from "To-do's" once started)

* **SEC IAPD Bulk Data ETL Pipeline Development (within ria-hunter-etl repo):**  
  * **Develop Python scripts for downloading SEC XML Compilation Reports.**  
    * **Status:** All locally available feed data is considered sufficient. `src/etl/extract.py` handles downloading specific XML if URL is known or discoverable (though discovery is unreliable). No further download development needed. 
    * **Known Issues/Challenges:**  
      * The discover\_current\_sec\_feed\_url function to automatically find the link for the *daily/weekly IAPD XML compilation feed (.xml.gz)* on adviserinfo.sec.gov is currently unreliable. Automated discovery for this specific feed is deferred.  
* **Implement XML parsing logic (using xml.etree.ElementTree or lxml) for Form ADV Part 1A data.**
    * **Status:** Basic XML parsing for adviser and private fund data (Item 7.B.1) implemented in `src/etl/transform.py` using `lxml.etree.iterparse` within the `parse_adv_xml_file` function. This is integrated into `process_extracted_feed_data`.
    * **Known Issues:** Bug #001 - XML Parser Failure on Specific Structure. The current implementation uses a common path for Item 7.B.1; alternative structures mentioned in Bug #001 are not yet explicitly handled but the parser includes a warning if Item7B is 'Y' but no funds are found at the default path. XSD validation is not yet implemented.
    * **Next Steps:** Test with actual XML data. Expand field extraction. Implement robust handling for Item 7 variations (Bug #001). Add XSD validation.
* **Core Application Frontend Development (jtpnexus-website / ria-hunter app):**  
  * **Design and implement the main search interface (location input, private investment filter) on jtpnexus-website.**  
    * **Status:** UI shell for RIA Hunter chat input exists on app/ria-hunter/page.tsx. Placeholder chat interactions and example prompts are present.  
    * **Known Issues:** Core chatbot functionality (sending queries, displaying results) is NOT YET IMPLEMENTED and currently leads to a "Coming Soon" modal.  
  * **Ensure UI/UX aligns with Section 18 recommendations (simplicity, clarity), including displaying the "data as of" date and potentially the time scope of data included.**  
    * **Status:** UI components and styling developed using Radix UI and Tailwind CSS. Theme management (light/dark) is implemented. This is an ongoing effort as features are built.

## **Completed To-do's**

(Items moved from "In Progress To-do's" or "To-do's" once finished)

* **Project Setup & Initial Configuration:**  
  * Create the ria-hunter-etl GitHub repository for the backend Python ETL scripts.  
  * Verify and complete Nx monorepo setup for ria-hunter app within AppFoundation.  
  * Configure environment variable management for the ria-hunter-etl project (using a .env file; src/config.py loads variables). openpyxl added to requirements.txt.  
* **SEC Data Extraction (src/etl/extract.py in ria-hunter-etl):**  
  * SEC\_USER\_AGENT correctly used for requests.  
  * Successfully discovers and downloads monthly IAPD (Investment Adviser Public Disclosure) data from the SEC website as .zip files containing .xlsx spreadsheets.  
  * Downloaded .zip files are automatically extracted, and contents stored in data/raw/monthly\_iapd/\<feed\_name\>/extracted\_files/.  
* **Supabase Integration (Initial in ria-hunter-etl):**  
  * Supabase credentials (SUPABASE\_URL, SUPABASE\_SERVICE\_ROLE\_KEY) added to .env and loadable.  
* **jtpnexus-website Frontend Setup:**  
  * Next.js (v15.2.4) project established with TypeScript.  
  * UI components and styling foundation using Radix UI, Tailwind CSS, lucide-react.  
  * Forms managed with react-hook-form and zod (client-side).  
  * Basic Next.js API Routes created:  
    * /api/save-form-data (saves to local text file).  
    * /api/ria-hunter-waitlist (logs to console; not currently used by main waitlist form).  
  * Functional RIA Hunter Waitlist System: Implemented via app/ria-hunter/page.tsx submitting data directly to a Google Apps Script Web App.  
  * "Coming Soon" modals for undeveloped features are in place.

## **Bug Issues**

This section lists known bugs or issues that need to be resolved.

* **Bug \#001: XML Parser Failure on Specific Structure**  
  * Description: The Python script for parsing SEC XML Compilation Reports crashes when encountering a rare but valid alternative XML structure for Item 7\.  
  * Impact: Medium (Affects data completeness for a small subset of RIAs)  
  * Complexity to Fix: Medium (Requires adjusting parsing logic and testing edge cases)  
  * Importance: High (Core data ingestion is affected)  
  * Status: Open  
* **Bug \#002: User Tag Input Allows Duplicates**  
  * Description: The "Living Profile" feature allows a user to enter the exact same tag multiple times for the same RIA.  
  * Impact: Low (Minor UI inconvenience, data redundancy)  
  * Complexity to Fix: Low (Requires frontend or backend validation check)  
  * Importance: Medium (Affects data quality for user-generated content)  
  * Status: Open

(Rest of the document, e.g., "RIA Hunter: Comprehensive Development, Implementation, and Enhancement Guide", "Part I: Strategizing RIA Hunter...", etc., remains the same as the original provided document. Only the Project Management & Tracking sections above have been updated.)