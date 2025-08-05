# **RIA Hunter: Project Management & Tracking**

*(Last Updated: {{{{datetime_iso_string}}}}) <!-- Will be replaced by current timestamp -->*

## **To-do's**

This section outlines the tasks that need to be accomplished by the AI agent and the user to build a successful RIA Hunter project.

1. **Project Setup & Initial Configuration:**  
   * \[ \] Create the ria-hunter-etl GitHub repository for the backend Python ETL scripts (see Section 8.4 for detailed setup instructions).  
   * \[ \] Verify and complete Nx monorepo setup for ria-hunter app within AppFoundation.  
   * \[ \] Configure .env.local in AppFoundation with all necessary API keys and environment variables (Supabase URL & Anon Key, Auth0, Google Gemini, Chroma (if used)).  
   * \[ \] Configure environment variable management for the ria-hunter-etl project (e.g., using a .env file for Supabase URL & Service Role Key).  
   * \[ \] Establish initial Supabase database schema based on **Merged Table 4 (Base Schema)**.  
   * \[ \] Confirm Auth0 integration (libs/auth) is functional for the new ria-hunter app.  
   * \[ \] **Set up initial CI/CD workflows (GitHub Actions) for both repositories as outlined in Section 8.5.**  
2. **SEC IAPD Bulk Data ETL Pipeline Development (within ria-hunter-etl repo):**  
   * \[x] Develop Python scripts for downloading SEC XML Compilation Reports.
     * **Note:** Data sourcing is considered complete. ETL will use locally available XML files. No further downloading logic development is required.
   * \[x] Develop Python scripts for downloading SEC Historical CSV Data (including all schedules).
     * **Note:** Data sourcing is considered complete. ETL will use locally available CSV ZIP files. No further downloading logic development is required.
   * \[ \] Implement XML parsing logic (using xml.etree.ElementTree or lxml) for Form ADV Part 1A data.  
   * \[ \] Implement CSV parsing logic (using pandas) for Form ADV Part 1A and all relevant schedules (especially Schedule D).  
   * \[ \] Develop data linking logic to combine multiple CSV tables using CRD numbers.  
   * \[ \] Implement data cleaning and transformation routines for SEC data.  
   * \[N/A] Define and implement logic within the ETL process to filter and retain Form ADV data filed from January 1, 2020, to the present.  
     * **Note:** This filtering is no longer required in the ETL pipeline. AppFoundation will handle any necessary date filtering on the data loaded.
   * \[ \] Develop scripts to load processed SEC data into Supabase tables, **implementing an "upsert" logic (update if exists based on CRD number, otherwise insert new).** (Time scope constraint removed)
   * \[x] Create a comprehensive list of USPS ZIP codes for all St. Louis MSA counties and integrate for geographic filtering.
     * **Note:** ZIP code research is considered complete with the data in `src/etl/geography.py`. No further research needed.
   * \[ \] **Write unit tests for ETL scripts (parsing, transformation, loading logic).**  
3. **Core Application Backend Development (Next.js API Routes within AppFoundation):**  
   * \[ \] Implement API route (GET /api/ria-hunter/search) for core RIA search functionality (querying Supabase).  
   * \[ \] Implement robust error handling and logging for all API routes.  
   * \[ \] Integrate Zod for request and response validation in API routes.  
   * \[ \] **Write unit/integration tests for API routes.**  
4. **Core Application Frontend Development (Next.js Pages/Components within AppFoundation):**  
   * \[ \] Design and implement the main search interface (location input, private investment filter).  
   * \[ \] Develop the results display table with pagination and sortable columns.  
   * \[ \] Create the detailed RIA profile page to display information from Supabase.  
   * \[ \] Ensure UI/UX aligns with Section 18 recommendations (simplicity, clarity), including displaying the "data as of" date and potentially the time scope of data included.  
   * \[ \] Leverage libs/ui-shared for consistent UI components.  
   * \[ \] **Write unit/component tests for key frontend components.**  
5. **"Living Profile" Enhancement Development (within AppFoundation & Supabase):**  
   * \[ \] Extend Supabase schema as per **Merged Table 4 (Expanded for Living Profile)** for user notes, tags, links, and metadata.  
   * \[ \] Implement Supabase Row Level Security (RLS) policies for user-specific data.  
   * \[ \] Develop backend API routes for CRUD operations on user notes, tags, links, and metadata.  
   * \[ \] Design and implement frontend UI sections on the RIA profile page for displaying and managing user-specific content.  
6. **"Investment Thesis Matcher" Enhancement Development (Phased \- ETL in ria-hunter-etl, Frontend/API in AppFoundation):**  
   * **Phase 1: Narrative Extraction & Basic Matching**  
     * \[ \] Enhance ETL pipeline (in ria-hunter-etl) to extract and store narrative text (Form ADV Part 2A, Schedule D "Miscellaneous") from filings into Supabase (see **Merged Table 4 additions**). (Time scope constraint removed)
     * \[ \] Develop backend API route (POST /api/ria-hunter/match-thesis in AppFoundation) for thesis input.  
     * \[ \] Implement initial keyword/phrase matching logic against stored narrative text.  
     * \[ \] Design and implement frontend UI for thesis input and display of basic match results (including highlighted text).  
   * **Phase 2: Embedding-based Semantic Search**  
     * \[ \] Integrate Google Gemini API (via libs/ai-services in AppFoundation and server-side proxy) for generating text embeddings from narrative snippets and user theses. (Time scope constraint removed for narrative snippets)
     * \[ \] Set up vector storage and search:  
       * Option A: Configure and use Chroma Cloud/DB (via libs/ai-services).  
       * Option B: Enable and use pgvector extension in Supabase (update schema in **Merged Table 4** for ria\_narrative\_embeddings).  
     * \[ \] Develop batch process (in ria-hunter-etl) for generating and storing embeddings for RIA narrative data. (Time scope constraint removed)
     * \[ \] Update thesis matching API route to use semantic search (cosine similarity) against embeddings.  
     * \[ \] Refine frontend display to show semantic match explanations.  
7. **Testing, Deployment, and Documentation:**  
   * \[ \] Conduct thorough testing of all features (ETL, core search, Living Profile, Investment Thesis Matcher).
   * \[ \] Perform UI/UX testing with a focus on the non-technical user experience.  
   * \[ \] Prepare for deployment on Vercel (jtpnexus.com/ria-hunter).  
   * \[ \] Finalize all technical documentation (including README.md for ria-hunter-etl detailing CI/CD setup) and user guides.
   * \[ \] Implement strategies for ongoing cost monitoring, especially for AI services.

## **In Progress To-do's**

*(Items moved from "To-do's" once started)*

* **Example Item:** Develop Python scripts for downloading SEC XML Compilation Reports.  
  * Status: Incomplete  
  * Known Issues: None  
* **Example Item:** Implement XML parsing logic.  
  * Status: Incomplete  
  * Known Issues: Bug \#001 \- Parser fails on specific XML structure.

## **Completed To-do's**

*(Items moved from "In Progress To-do's" once finished)*

* **Example Item:** Verify and complete Nx monorepo setup for ria-hunter app.

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

# **RIA Hunter: Comprehensive Development, Implementation, and Enhancement Guide**

## **Overall Introduction**

The "RIA Hunter" project is conceived to identify Registered Investment Advisors (RIAs) operating within the St. Louis metropolitan area that demonstrate involvement in private investment activities. This identification will be primarily based on the analysis of data from Form ADV filings, a public disclosure document mandated by the U.S. Securities and Exchange Commission (SEC). The end-user of this project is a non-technical hobbyist with a constrained budget, a factor that significantly influences technology choices, data acquisition strategies, and the overall implementation approach.

The project involves two main components:

1. A **Backend ETL (Extract, Transform, Load) Process**, likely developed in Python, responsible for acquiring, cleaning, filtering, and loading SEC Form ADV data into a Supabase database. This process will reside in its own GitHub repository.  
2. A **Frontend Application** (ria-hunter), which will be a Next.js application within the existing **AppFoundation monorepo** (https://github.com/Turnstyle/AppFoundation). This application will consume data from the Supabase database populated by the ETL process.

This document serves as a comprehensive research report and technical guide intended for consumption by an AI developer tasked with implementing both components of the RIA Hunter project. It aims to bridge the gap between the user's vision and the technical execution.

Furthermore, this guide incorporates two strategic enhancements for the frontend application: the "Living Profile," enabling users to add personal research to RIA profiles, and the "Investment Thesis Matcher," employing AI to find RIAs based on natural language investment interests. These enhancements aim for a tenfold improvement in user experience and project value, adhering to manageable code complexity and minimal additional cost.

A key consideration throughout is the cost-effective acquisition of Form ADV data, focusing on publicly available SEC sources. Data sourcing is considered complete based on user-provided local files. The non-technical nature of the end-user emphasizes clarity in explaining technical decisions and demands a simple, intuitive User Interface (UI) and User Experience (UX) for presenting complex financial data.

## **Part I: Strategizing RIA Hunter: Data and Definitions**

### **Section 1: Understanding the RIA Hunter Project within AppFoundation**

*(As detailed in the original "RIA Hunter: Development Guide (SEC IAPD Focus)", Section 1, with notes on data scope and the two-component structure)*

The "RIA Hunter" project is conceived to identify Registered Investment Advisors (RIAs) operating within the St. Louis metropolitan area that demonstrate involvement in private investment activities. This identification will be primarily based on the analysis of data from Form ADV filings, a public disclosure document mandated by the U.S. Securities and Exchange Commission (SEC). The data collection scope will encompass all locally available data provided by the user. The end-user of this project is a non-technical hobbyist with a constrained budget, a factor that significantly influences technology choices, data acquisition strategies, and the overall implementation approach.

The frontend application (ria-hunter) will be developed leveraging the existing AppFoundation monorepo, a pre-established codebase structured with Nx and built upon Next.js and TypeScript. This foundation provides a considerable head start. The AppFoundation monorepo already incorporates shared libraries for critical functionalities: libs/auth for authentication (utilizing Auth0), libs/supabase for database interactions with Supabase, libs/ai-services which includes stubs for Google Gemini and Chroma integration, and libs/ui-shared for reusable user interface components. The presence of these pre-configured elements means that the development effort for the frontend can be more directly focused on the unique logic of RIA Hunter, such as specific filtering for private investment indicators and geographic location, and the presentation of results, rather than on foundational boilerplate setup. This inherent acceleration is particularly beneficial given the user's budgetary considerations. The target deployment for the RIA Hunter application is jtpnexus.com/ria-hunter, utilizing Vercel for hosting.

The Backend ETL Process will be a separate project, likely in Python, responsible for populating the Supabase database that the AppFoundation frontend consumes.  
(rest of Section 1 remains the same)

### **Section 2: Decoding Form ADV for Private Investment and Location Insights**

*(Content remains the same)*

### **Section 3: Defining the "St. Louis Region" \- Geographic Targeting Strategies**

*(Content remains the same. The strategy of using USPS ZIP codes is maintained. ZCTAs are mentioned as a future consideration but no specific ZCTA documents are referenced as current project resources.)*

USPS ZIP Codes vs. ZIP Code Tabulation Areas (ZCTAs): A distinction exists between USPS ZIP codes, designed for mail delivery efficiency, and ZCTAs, which are statistical geographic areas created by the U.S. Census Bureau to approximate USPS ZIP code service areas for data tabulation. While ZCTAs are valuable for demographic analysis and mapping Census data, Form ADV filings contain standard street addresses, including USPS ZIP codes. Therefore, for the purpose of filtering RIA data directly from Form ADV (from SEC bulk downloads), using USPS ZIP codes is the more practical and direct approach. ZCTAs might be considered for future enhancements if demographic overlays were desired, but for the current scope, focusing on USPS ZIP codes simplifies the initial data filtering.  
(Rest of Section 3 remains the same)

## **Part II: Acquiring Form ADV Data: Focusing on Publicly Available Sources**

The core of the RIA Hunter project revolves around accessing and analyzing Form ADV data. Data sourcing is considered complete based on locally available files provided by the user. This will be handled by the Backend ETL Process.

### **Section 4: Leveraging SEC IAPD Public Data (Bulk Downloads)**

*(Content updated to reflect use of existing local data, notes on date filtering removed/adjusted)*

### **Section 5: Exploring Other Data Avenues**

*(Content updated to reflect data sourcing is complete)*

## **Part III: Core Technical Blueprint for RIA Hunter**

This part details the architectural and implementation strategies for both the Backend ETL Process and the Frontend Application within AppFoundation, focusing on the use of locally available SEC IAPD bulk data.

### **Section 6: Architecture & Implementation (Focus on SEC IAPD Data)**

(Content remains largely the same, with clarification on "upsert" logic and removal of date filtering in ETL)  
...  
Data Ingestion and Processing Workflow: The core of this approach involves building an ETL (Extract, Transform, Load) pipeline to process the SEC's bulk data (sourced from local files).  
...  
4\. Storing in Supabase:  
\* Load the cleaned, transformed, and linked data into the Supabase PostgreSQL database, using the schemas defined in Merged Table 4\. (Date filtering in ETL removed)
\* Upsert Logic: When loading data, especially during updates or reprocessing, an "upsert" (update if exists, insert if new) strategy must be employed. This typically involves checking if a record with the same unique identifier (e.g., the firm's crd\_number) already exists in the target table. If it does, the existing record is updated with the new information. If it doesn't, a new record is inserted. This prevents data duplication and ensures records reflect the latest available information from the SEC filings. SQLAlchemy or direct SQL commands within the Python ETL scripts can be used to implement this logic.  
... (rest of Section 6 remains the same)

### **Section 7: Core Development Components (Applicable to both ETL and Frontend)**

*(Content remains the same)*

### **Section 8: Project Repositories, Data Flow, Integration, and Automation**

This section details the structure of the project components, how data flows between them, how they integrate, and recommendations for automation.

*(Subsections 8.1 Overview of Repositories, 8.2 Data Flow Diagram, 8.3 Connecting Components (Supabase Integration) remain the same as the version before the local folder instructions were added.)*

**8.4 Instructions for Creating the ria-hunter-etl GitHub Repository**

These steps guide you through setting up the new repository for the Python ETL scripts. **This assumes you have already created a local folder named** ria-hunter-etl **and have opened it in your IDE (e.g., Cursor).**

* **a. Initialize Git in Your Local Folder (Using Cursor's Terminal or any command line):**  
  1. **Open a Terminal in Cursor:** Cursor usually has an integrated terminal. You can typically open it via a menu option like Terminal \> New Terminal or View \> Terminal. Make sure the terminal is open at the root of your ria-hunter-etl folder.  
  2. **Initialize Git:** Type the following command and press Enter:  
     git init

     This command creates a new hidden .git subfolder in your ria-hunter-etl directory, which turns it into a Git repository.  
* **b. Create the Repository on GitHub:**  
  1. Go to GitHub (https://github.com).  
  2. Click the "+" icon in the top-right corner and select "New repository."  
  3. Repository name: ria-hunter-etl (it's good practice to match your local folder name).  
  4. Description: (Optional, e.g., "Backend ETL process for the RIA Hunter project...")  
  5. Choose "Public" or "Private".  
  6. **Important:** *Do not* initialize this new repository on GitHub with a README, .gitignore, or license if you've already run git init locally.  
  7. Click "Create repository."  
* **c. Link Your Local Repository to the GitHub Remote Repository:**  
  1. After creating the repository on GitHub, GitHub will show you a page with instructions. Look for the section "…or push an existing repository from the command line."  
  2. Copy the commands provided. They will look something like this:  
     git remote add origin https://github.com/YourUserName/ria-hunter-etl.git  
     git branch \-M main

     (Replace YourUserName with your actual GitHub username.)  
  3. Paste and run these commands in your local terminal (within the ria-hunter-etl folder in Cursor).  
* **d. Set up a Python Virtual Environment (within your local ria-hunter-etl folder):**  
  python3 \-m venv venv  
  source venv/bin/activate \# (or appropriate activation command for your OS/shell)

* e. Create/Update .gitignore:  
  Create a file named .gitignore in the root of your ria-hunter-etl folder. Add standard Python and virtual environment ignores (e.g., venv/, \_\_pycache\_\_/, .env).  
* f. Create an Initial README.md:  
  Create a README.md file with a project title, brief description, and setup/run instructions.  
* g. Create requirements.txt for Dependencies:  
  Create an empty requirements.txt. Initial dependencies will likely include pandas, requests, lxml, python-dotenv, supabase.  
* h. Create .env.example:  
  Create .env.example showing needed environment variables like SUPABASE\_URL, SUPABASE\_SERVICE\_ROLE\_KEY.  
* **i. Initial Commit and Push:**  
  git add .gitignore README.md requirements.txt .env.example  
  git commit \-m "Initial project structure for ETL process"  
  git push \-u origin main

8.5 CI/CD (Continuous Integration/Continuous Deployment) Recommendations  
(Content remains the same as previous version)  
*(Subsequent sections will be renumbered starting from Section 9\)*

### **Section 9: Core Development Components (Applicable to both ETL and Frontend)**

*(Formerly Section 7\. Content remains the same)*

## **Part IV: Strategic Enhancements for Amplified Utility**

*(Formerly Part III. Sections within will be renumbered accordingly)*

### **Section 10: Introduction to Strategic Enhancements**

*(Formerly Section 8\)*

### **Section 11: Enhancement 1: "Living Profile" – User-Driven RIA Intelligence**

*(Formerly Section 9\)*

### **Section 12: Enhancement 2: "Investment Thesis Matcher" – Simplified AI for Personalized Discovery**

*(Formerly Section 10\)*

### **Section 13: Integrating Enhancements: Synergies and Alignment with Core Project Constraints**

*(Formerly Section 11\)*

### **Section 14: Summary Table of Strategic Enhancements**

(Formerly Section 12, Merged Table 6 becomes Merged Table 7\)  
Merged Table 7: Strategic Enhancements: Value, Impact, and Practicality  
(Content of table remains the same)

## **Part V: Ensuring Long-Term Project Viability**

*(Formerly Part IV. Sections within will be renumbered accordingly)*

### **Section 15: Data Freshness and Quality Assurance Plan**

(Formerly Section 13\. Explicitly mention "upsert" logic when discussing data updates.)  
...  
Data Freshness Strategies (Using SEC IAPD Bulk Downloads):

* XML compilation reports are typically "as of" a specific date (e.g., daily or weekly snapshots).  
* CSV files containing schedules are updated quarterly.  
* Strategy: The current ETL processes locally available data. If new bulk files are manually downloaded by the user in the future, re-running the ETL pipeline will update the Supabase database. When re-running the ETL to update data, it's crucial to use an "upsert" (update if exists, insert if new) logic based on the firm's crd\_number to ensure data integrity and avoid duplicates. The UI should clearly indicate the "data as of" date based on the latest processed feeds.
  ... (rest of Section 15 remains the same)

### **Section 16: Designing for Scalability, Performance, Logging, and Monitoring**

*(Formerly Section 14\)*

### **Section 17: Ongoing Cost Management, Budgeting, and Alerting Strategies**

*(Formerly Section 15\)*

### **Section 18: UI/UX Recommendations for the Non-Technical User**

*(Formerly Section 16\)*

### **Section 19: Structuring Outputs for AI Developer Consumption**

*(Formerly Section 17\)*

## **Part VI: Cost Analysis and Final Recommendations**

*(Formerly Part V. Sections within will be renumbered accordingly)*

### **Section 20: Detailed Cost Breakdown**

*(Formerly Section 18\)*

### **Section 21: Summary of Recommendations and Next Steps**

*(Formerly Section 19\. Add CI/CD recommendation.)*

The RIA Hunter project, with its proposed enhancements, is technically feasible and offers significantly amplified value. The AppFoundation monorepo provides a solid base for the frontend, while a separate Python project will handle the backend ETL.

**Recommendations for the User:**

1. Acknowledge Project Complexity: The chosen path, especially with AI integration and separate backend/frontend components, involves substantial data engineering, AI pipeline management, and integration efforts.  
2. Prioritize Core Features First, Then Enhancements: Focus initial development on core RIA identification (ETL and basic frontend search). Then, implement "Living Profile," followed by a phased rollout of the "Investment Thesis Matcher" (starting simple, e.g., keyword, then embeddings).  
3. Understand AI Cost Implications: Be prepared to manage usage of Gemini/Chroma to stay within budget, possibly by limiting AI analysis frequency or making it an on-demand user action.

**Recommendations for the AI Developer (if proceeding with implementation):**

1. Prioritize Data Validation (Zod): Implement Zod for all SEC data and user inputs in the frontend. Implement robust data validation in the Python ETL.  
2. Robust SEC IAPD Bulk Data ETL: This remains foundational. Ensure the ETL pipeline **uses upsert logic for data loading**. Enhance to extract narrative text for the Matcher. (Date filtering in ETL removed)
3. Careful Geographic Filtering: Utilize the compiled St. Louis MSA ZIP codes in `src/etl/geography.py`.  
4. Iterative Enhancement Implementation:  
   * **Living Profile:** Implement CRUD operations and RLS for user content.  
   * **Investment Thesis Matcher:**  
     * Phase 1: Extract narratives. Implement basic keyword matching.  
     * Phase 2: Integrate Google Gemini for embedding generation (batch process). Implement vector search (Chroma or pgvector).  
     * Focus on clear explanations for AI matches.  
5. Follow UI/UX Guidelines: Design the user interface with the non-technical end-user in mind (Section 18).  
6. Leverage AppFoundation Structure: Utilize the existing Nx monorepo and shared libraries for the frontend. Maintain a clean, well-documented structure for the ria-hunter-etl Python project.  
7. Address the Five Vital Aspects (Part V): Proactively incorporate strategies for data freshness/QA, scalability/performance (especially for AI), logging/monitoring, ongoing cost management (critical for AI), UI/UX, and clear technical documentation.  
8. **Implement CI/CD Pipelines:** Set up GitHub Actions for both the ria-hunter-etl (Python) and AppFoundation (Next.js) repositories as outlined in Section 8.5. This will automate code quality checks (linting, testing) and streamline the deployment of the frontend application to Vercel, leveraging Nx capabilities for the monorepo.

Final Thoughts on Project Viability:  
(Content remains the same)

## **Works Cited**

*(Content remains the same)*