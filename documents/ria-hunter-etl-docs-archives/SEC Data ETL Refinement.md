# **Advancing the 'RIA Hunter' Project: Regex Resolution, SEC Data Acquisition, Supabase Integration, and Python Ecosystem**

## **I. Introduction**

The 'RIA Hunter' project aims to develop a robust system for acquiring, processing, and analyzing data pertaining to Registered Investment Advisers (RIAs). This report outlines a comprehensive strategy to advance the project by addressing critical technical challenges and establishing a scalable data infrastructure. Key objectives include resolving an existing regex failure within the ETL (Extract, Transform, Load) process, enhancing the acquisition of data from the U.S. Securities and Exchange Commission (SEC), defining an optimized schema for storing this data in Supabase, and implementing efficient data loading mechanisms. Furthermore, this report details the recommended Python libraries and their dependencies, providing a clear path for development and ensuring a maintainable codebase. The successful execution of these tasks will provide a solid foundation for the 'RIA Hunter' project's analytical capabilities.

## **II. Resolving the Regex Failure in src/etl/transform.py**

Regular expression failures in data processing pipelines can often be attributed to the nuanced complexities of text data, particularly when dealing with diverse sources like SEC filings. Common culprits include unexpected Unicode characters, subtle differences in character representations that appear visually identical, the greedy nature of certain regex quantifiers, or improperly defined capturing groups. To effectively address such failures, a systematic approach involving data inspection at the byte level and the application of robust Unicode normalization techniques is essential.

### **A. Understanding the Nature of the Regex Failure**

Before a precise solution can be formulated, the root cause of the regex failure must be identified. Failures often arise when patterns do not account for the full spectrum of Unicode characters or their various normalized forms. For instance, a character with an accent might be represented as a single precomposed character or as a base character followed by a combining diacritical mark. Standard regex engines might treat these as different sequences if not handled correctly. Inspecting the raw byte strings of problematic text can reveal non-printable characters or encoding issues that are not apparent when viewing the text as strings.

### **B. Python Libraries for Advanced Regex and Unicode Handling**

Python's standard library provides foundational tools, but for complex scenarios, more specialized libraries offer significant advantages.  
**1\. The regex Library**  
The third-party regex library is a powerful alternative to Python's built-in re module. It offers enhanced Unicode support, including compliance with newer Unicode standards (e.g., Unicode 16.0.0), and provides a richer set of features such as fuzzy matching, atomic grouping, possessive quantifiers, and improved handling of nested sets and set operations. A key benefit for concurrent applications is its ability to release the Global Interpreter Lock (GIL) during matching operations on immutable strings, potentially improving performance in multi-threaded environments. The regex library is designed to be largely backward-compatible with re, facilitating easier adoption. It also introduces versioning flags (VERSION0 for re-compatible behavior and VERSION1 for newer, often more correct, behavior, especially concerning zero-width matches and inline flags).  
**2\. The unicodedata Module**  
The standard unicodedata module is indispensable for working with Unicode text. Its normalize() function allows for the conversion of Unicode strings into one of four standard normalization forms: NFC (Normalization Form C), NFD (Normalization Form D), NFKC (Normalization Form KC), and NFKD (Normalization Form KD).

* **NFC** (Canonical Composition): Characters are decomposed and then recomposed into their canonical precomposed form.  
* **NFD** (Canonical Decomposition): Characters are decomposed into their canonical base characters and combining marks.  
* **NFKC** (Compatibility Composition): Compatibility characters are first decomposed to their equivalents, and then canonical composition is applied. This form is often aggressive in normalization and useful for matching.  
* **NFKD** (Compatibility Decomposition): Compatibility characters are decomposed to their equivalents, and then canonical decomposition is applied. Normalization ensures that strings that are semantically equivalent but have different byte representations (e.g., "é" as a single character vs. "e" \+ combining acute accent) can be converted to a consistent form, which is crucial for reliable regex matching and data comparison.

**3\. binascii and bytes.hex() for Byte-Level Inspection**  
When dealing with obscure character issues or needing to understand the precise byte representation of a string, tools for converting bytes to hexadecimal representations are invaluable.

* The bytes.hex() method converts a bytes object into a string of hexadecimal digits, with each byte represented by two hex characters.  
* The binascii.hexlify() function performs a similar conversion but returns a bytes object, which can then be decoded to a string. The inverse operations, bytes.fromhex() and binascii.unhexlify(), convert hexadecimal strings back to bytes objects. These functions are particularly useful for debugging by allowing developers to inspect non-printable characters or subtle byte-level differences that might be causing regex patterns to fail.

### **C. Proposed Solution and Best Practices for Regex Handling**

A robust solution to the regex failure involves a combination of text pre-processing and leveraging the advanced capabilities of the regex library.  
**1\. Pre-processing Text Data:** Prior to applying regular expressions, text data should undergo normalization. Applying NFKC normalization (unicodedata.normalize('NFKC', text)) is often a good choice as it aggressively normalizes by decomposing compatibility characters and then recomposing, which can help in matching visually similar but differently encoded strings. Depending on the specific requirements, converting text to a consistent case (e.g., lowercasing) might also be beneficial if the regex is not set to be case-insensitive or if case variations are not meaningful.  
The critical role of Unicode normalization, particularly NFKC, in pre-processing text cannot be overstated. Many elusive regex failures originate from characters that appear identical to the human eye but possess different underlying Unicode representations (e.g., different forms of spaces, dashes, or accented characters). Normalization collapses these variations into a canonical form, significantly increasing the reliability of subsequent regex operations. Without this step, regex patterns might fail to match strings they are logically intended to capture.  
**2\. Utilizing the regex Library:** It is recommended to replace usages of the standard re module with the regex library to take advantage of its superior Unicode handling and extended feature set. Adopting regex.V1 behavior can provide more consistent and correct matching, especially for edge cases involving zero-width assertions or complex Unicode scripts. For intricate patterns involving specific Unicode character properties (e.g., matching any letter, number, or punctuation across various languages), the regex library's support for Unicode properties like \\p{L} (any letter) or \\p{Sc} (any currency symbol) is invaluable.  
The regex library's design, with its more comprehensive Unicode support and features like approximate (fuzzy) matching or variable-length lookbehind, makes it a more suitable tool than the standard re module when dealing with the diverse and sometimes inconsistent text data found in financial and regulatory documents. This is particularly relevant for the 'RIA Hunter' project, which will process data from various SEC filings that may contain a wide range of textual content.  
**3\. Debugging and Testing:** When a regex fails, the first step is to isolate the specific string(s) causing the issue. The bytes.hex() or binascii.hexlify() functions can then be used to examine the byte-level representation of these strings, revealing any hidden or problematic characters. Regex patterns should be tested against both the original and the normalized versions of these problematic strings. It is also a standard best practice to use raw string notation (e.g., r"your\_pattern\\d+") for defining regex patterns in Python; this prevents backslashes within the pattern from being interpreted as Python escape sequences, ensuring the regex engine receives the intended pattern.

### **D. Summary of Regex Resolution Strategy**

By systematically inspecting problematic data, applying appropriate Unicode normalization (preferably NFKC), and utilizing the advanced capabilities of the regex library, the existing regex failure in src/etl/transform.py can be effectively resolved. This approach not only fixes the immediate issue but also establishes a more resilient text processing framework for the 'RIA Hunter' project.

## **III. Enhancing SEC Data Acquisition for 'RIA Hunter'**

Acquiring comprehensive and reliable data is fundamental to the 'RIA Hunter' project. The U.S. Securities and Exchange Commission (SEC) provides several avenues for accessing information on Registered Investment Advisers (RIAs) and their activities, primarily through the Investment Adviser Public Disclosure (IAPD) system and the Electronic Data Gathering, Analysis, and Retrieval (EDGAR) system.

### **A. Primary Data Source: IAPD Compilation Reports**

The most direct and structured source for RIA data, particularly Form ADV information, is the IAPD Compilation Reports page (adviserinfo.sec.gov/compilation). This resource provides:

* **SEC Investment Adviser Report:** An XML file containing information about investment advisers registered with the SEC or filing as Exempt Reporting Advisers.  
* **State Investment Adviser Report:** A similar XML file for state-registered advisers.  
* **Firm XML Schema Definition Document (XSD):** Crucially, this page also provides the XSD files that define the structure and data types for these XML reports. These schemas are essential for validating and accurately parsing the XML data.

The data in these compilation reports is sourced directly from the electronic submission of Form ADV by investment adviser firms to the IARD system. Form ADV contains extensive information about an adviser's business, ownership, clients, affiliations, and disciplinary history. Key sections typically included are Item 1 (Identifying Information), Item 5 (Information About Your Advisory Business), Item 7 (Financial Industry Affiliations and Private Fund Reporting), Item 9 (Custody), and Item 11 (Disclosure Information).  
The availability of these IAPD XML compilation feeds, along with their corresponding XSDs, represents a significant advantage for data acquisition. These feeds offer structured, official, and machine-readable data specifically curated for dissemination. Compared to parsing individual EDGAR filings or resorting to web scraping, utilizing these feeds is far more reliable and efficient for obtaining core RIA registration and operational data. This approach simplifies the parsing process, enhances data quality (as it is the officially submitted data), and provides clear schemas that can directly inform database design and data validation procedures. Therefore, the primary data acquisition strategy for the 'RIA Hunter' project should heavily prioritize these IAPD XML feeds.

### **B. Accessing Historical SEC Data**

While the IAPD compilation page provides current data, historical Form ADV information is also available.

* The adviserinfo.sec.gov/adv page and the SEC's FOIA section (sec.gov/foia/docs/invafoia.htm) provide access to historical ADV Part 1 filing data for SEC-registered investment advisers from January 2001 onwards, and for SEC exempt reporting advisers from December 2011 onwards.  
* This historical data is typically provided in .csv format, packaged in ZIP files.  
* A critical point is that these historical CSV datasets often consist of multiple tables that require careful combination or linking to reconstruct a complete picture of an adviser's filings over time. Monthly ZIP archives are available for both Registered and Exempt Advisers.

### **C. Leveraging SEC EDGAR APIs (for Supplementary Data)**

The SEC EDGAR system also offers APIs that can provide supplementary data, although the IAPD compilation feeds are more direct for Form ADV information. The official EDGAR API documentation can be found at sec.gov/edgar/sec-api-documentation.

* These APIs provide access to an entity's filing history and extracted XBRL data from financial statements (e.g., forms 10-Q, 10-K).  
* Individual entity filing history can be accessed using the entity's 10-digit Central Index Key (CIK) via a URL like https://data.sec.gov/submissions/CIK\#\#\#\#\#\#\#\#\#\#.json.  
* Bulk downloads of this data are also available as ZIP files (e.g., companyfacts.zip, submissions.zip). While these APIs are powerful, they primarily focus on company filings rather than the specific structure of Form ADV data provided by IAPD. They might be useful for cross-referencing CIKs or obtaining broader company filing information if needed by the 'RIA Hunter' project. Users should be mindful of the SEC's access policies and rate limits when using these APIs. Third-party APIs like sec-api.io also exist but are not the primary focus here.

### **D. Parsing SEC Data (Focus on Form ADV Part 1 and Schedule D Section 7.B.(1))**

Once the data is acquired, it must be parsed and transformed.  
**1\. XML Parsing: Recommended Libraries and Techniques** Given the IAPD compilation reports are in XML format, robust XML parsing is crucial.

* **lxml:** This library is highly recommended for parsing the SEC XML files. It is known for its speed, efficiency with large files, and comprehensive feature set, including full XPath 1.0 support for navigating the XML tree, XSLT 1.0, and, importantly, XML Schema (XSD) validation capabilities.  
* **xml.etree.ElementTree (ET):** While part of the Python standard library and suitable for simpler XML tasks, lxml is generally superior for the complexity and size of SEC data.  
* **XSD Validation:** The XSDs provided on the IAPD compilation site should be used with lxml to validate the structure and data types of the incoming XML files. This step ensures data integrity before proceeding with parsing and loading. An XML schema defines the permissible elements, their contents, structure, and data types.  
* **Navigating the XML Tree:** XPath expressions, used with lxml, provide a powerful way to select specific data elements from the Form ADV XML. Key areas of focus for the 'RIA Hunter' project include:  
  * **Item 1:** Identifying Information (Legal Name, CIK, addresses, etc.).  
  * **Item 5:** Information About Your Advisory Business (AUM, number of accounts, types of clients, advisory services offered).  
  * **Item 7.B and Schedule D, Section 7.B.(1):** Private Fund Reporting. This section is particularly vital if the 'RIA Hunter' project aims to analyze RIAs managing private funds. It contains detailed information such as private fund identifiers, names, gross asset values, fund types (e.g., hedge fund, private equity), auditors, custodians, and prime brokers.

The information contained within Form ADV Part 1A, Schedule D, Section 7.B.(1) offers a granular view into the private fund activities of RIAs. This includes specifics about fund structure, assets, service providers (auditors, prime brokers, custodians), and investor composition. The Form ADV instructions provide detailed guidance on how this information should be reported, including for complex master-feeder arrangements and various fund categorizations (hedge fund, private equity fund, venture capital fund, etc.). For a project like 'RIA Hunter,' which may seek to identify RIAs with specific private fund characteristics, this section of Form ADV is a critical and rich dataset. The parsing logic and subsequent database schema must be carefully designed to capture this level of detail effectively, as it can provide significant analytical value and potentially differentiate the project's capabilities.  
**2\. Handling CSV/Spreadsheet Data (from historical ZIPs) with pandas** For historical data provided in CSV format :

* The pandas library, with its read\_csv() (or read\_excel() if.xlsx files are encountered ) function, is the standard tool for loading and manipulating this tabular data.  
* As noted, the historical CSVs often comprise multiple related tables. This necessitates data wrangling using pandas to merge, join, and reshape the data into a format suitable for loading into the target Supabase schema.  
* Attention must be paid to potential data type inconsistencies, handling missing values (NaN), and ensuring that column names from the historical files are correctly mapped to the defined Supabase schema.

**Table: Key Data Fields in Form ADV Part 1 & Schedule D Section 7.B.(1) relevant to 'RIA Hunter'**

| Form ADV Item/Schedule.Field | Description | Example XML Path (Illustrative) | Data Type (Expected) | Importance/Use Case for 'RIA Hunter' |
| :---- | :---- | :---- | :---- | :---- |
| Item 1.A. CIK | Central Index Key of the Adviser | /ADV/Info/CIK | TEXT | Unique identifier for adviser lookup and linking. |
| Item 1.B. Legal Name | Full legal name of the advisory firm | /ADV/Info/LegalName | TEXT | Primary name for identifying the RIA. |
| Item 1.F. Main Office Address | Street, City, State, Zip, Country of principal office | /ADV/Info/MainOffc/... | TEXT | Location analysis, geographic filtering. |
| Item 5.F.(2)(c) Total AUM | Total Regulatory Assets Under Management | /ADV/Part1A/Item5/F/TotalAUM | BIGINT/NUMERIC | Key metric for RIA size and ranking. |
| Item 7.B.(1) Q.1 Private Fund Name | Name of the private fund | /ADV/SchedD/Sec7B1/Item/Info/Name | TEXT | Identifying specific private funds. |
| Item 7.B.(1) Q.2 Private Fund ID | SEC-generated Private Fund Identification Number | /ADV/SchedD/Sec7B1/Item/Info/PFId | TEXT | Unique identifier for private fund tracking. |
| Item 7.B.(1) Q.10 Fund Type | Type of private fund (e.g., Hedge, Private Equity) | /ADV/SchedD/Sec7B1/Item/FundType | TEXT | Categorizing funds for targeted analysis. |
| Item 7.B.(1) Q.11 Gross Asset Value | Gross asset value of the private fund | /ADV/SchedD/Sec7B1/Item/GrossNAV | NUMERIC | Size of the private fund. |
| Item 7.B.(1) Q.23(a) Auditor Name | Name of the private fund's auditor | /ADV/SchedD/Sec7B1/Item/Audit/Auditor/Name | TEXT | Identifying service providers, due diligence. |
| Item 7.B.(1) Q.24(a) Prime Broker Name | Name of the private fund's prime broker | /ADV/SchedD/Sec7B1/Item/PrimeBrkr/Item/Name | TEXT | Identifying key counterparty relationships. |
| Item 7.B.(1) Q.25(a) Custodian Name | Name of the private fund's custodian | /ADV/SchedD/Sec7B1/Item/Custodian/Item/Name | TEXT | Identifying where fund assets are held. |

This table serves as a preliminary data dictionary and a guide for developing parsing logic, connecting the official Form ADV structure to the project's data extraction needs, with a special focus on the detailed private fund information available in Schedule D Section 7.B.(1).  
The transition from current XML-based data from IAPD compilations to historical CSV-based data presents a notable challenge. Form ADV itself has been amended over the years , implying that the structure and available fields in older CSVs may not directly map to the current XML schema or the target Supabase schema. If a comprehensive historical analysis is a requirement for 'RIA Hunter', a significant data archaeology and transformation effort will be necessary. This includes understanding schema evolution over time, developing logic to handle fields that may be missing or differently represented in older datasets, and ensuring consistent mapping to the unified database schema. This potential complexity should be factored into project timelines and resource allocation if deep historical data is a core objective.

### **E. Contingency: Web Scraping for Dynamic or Unstructured SEC Data**

While direct data feeds and APIs are strongly preferred, there might be rare scenarios where web scraping could be considered as a contingency:

* Accessing very specific, non-standardized information presented on SEC websites but not available through structured feeds.  
* Interacting with JavaScript-rendered content on IAPD or other SEC portals if, for some unforeseen reason, the compilation feeds become unavailable or insufficient (though this is unlikely for the core Form ADV data).

If scraping becomes necessary:

* **requests \+ BeautifulSoup4:** For parsing static HTML content. BeautifulSoup4 is adept at navigating and extracting data from HTML and XML document structures.  
* **Selenium or Playwright:** For dynamic websites that heavily rely on JavaScript to render content, or if interaction (like form submissions or button clicks) is needed to access data. Selenium is a long-standing browser automation tool , while Playwright is a more modern alternative often favored for its robust API, auto-waiting capabilities, and support for multiple browser engines.

Web scraping should be a last resort due to its inherent brittleness (changes in website structure can break scrapers) and ethical considerations (respecting robots.txt and website terms of service is paramount).

## **IV. Supabase Schema Definition for RIA Data**

A well-designed database schema is crucial for efficiently storing, querying, and analyzing the acquired SEC RIA data. Supabase utilizes PostgreSQL, a powerful open-source relational database, allowing for a robust and scalable schema.

### **A. Core Entities and Relationships**

Based on the structure of Form ADV and the likely analytical needs of the 'RIA Hunter' project, the following core entities are proposed:

* **Adviser**: Represents the central Registered Investment Adviser firm. The primary key will likely be derived from the CIK or an internal serial key, with CIK being a unique identifier.  
* **Filing**: Represents an individual Form ADV filing instance for an adviser. This entity is essential for tracking changes in an adviser's reported information over time. It would link to the Adviser entity.  
* **PrivateFund**: Stores detailed information about each private fund managed by an adviser, primarily sourced from Schedule D, Section 7.B.(1) of Form ADV. Each PrivateFund record would link to a specific Filing (and thus to an Adviser). The Private Fund ID assigned by the SEC can serve as a unique key.  
* **ControlPerson**: Contains information about the control persons of the advisory firm, as reported in Item 10 of Form ADV. This would link to a Filing.  
* **Affiliation**: Details financial industry affiliations of the adviser or its related persons, from Item 7.A of Form ADV. This would link to a Filing.  
* **Other Entities**: Depending on the depth of analysis required, additional entities could be modeled, such as AdvisoryBusinessInfo (from Item 5), ClientProfile (types of clients, AUM per client type), CustodyInfo (from Item 9), etc.

Relationships will be primarily one-to-many (e.g., one Adviser to many Filings; one Filing to many PrivateFunds).  
The "Firm XML Schema Definition Document" available from adviserinfo.sec.gov/compilation provides the canonical structure of the raw XML data. While this XSD is the direct source for understanding the available fields and their types, XML's hierarchical nature, often involving nested elements and repetitions, does not map directly to a flat relational table structure. Effective schema design for Supabase (PostgreSQL) will necessitate a normalization process. This involves carefully decomposing the hierarchical XML structure into multiple related tables, establishing primary and foreign keys to represent the inherent relationships (e.g., an adviser having multiple private funds, each with its own set of attributes). Attempting to store all data from a complex Form ADV filing into a single, wide table would lead to significant data redundancy, update anomalies, and inefficient querying. Thus, a thoughtful mapping from XSD elements and attributes to a normalized relational schema is a critical step.

### **B. Proposed Table Structures with Data Types and Constraints**

The following are illustrative examples of table structures. The exact columns and data types should be finalized by referencing the IAPD XSDs. PostgreSQL data types like TEXT, VARCHAR(n), INTEGER, BIGINT (for AUM), NUMERIC(precision, scale) (for precise financial figures), BOOLEAN, DATE, TIMESTAMP WITH TIME ZONE, and potentially JSONB for highly variable or deeply nested data will be used.  
**Table: Proposed Supabase Schema for Core RIA Data**

| Table Name | Column Name | Data Type (PostgreSQL) | Constraints | Notes (Source: Form ADV Item/Schedule) |
| :---- | :---- | :---- | :---- | :---- |
| **advisers** | adviser\_pk | SERIAL | PRIMARY KEY | Internal primary key. |
|  | cik | TEXT | UNIQUE, NOT NULL | Item 1.A. Central Index Key. |
|  | legal\_name | TEXT |  | Item 1.B. |
|  | main\_addr\_street1 | TEXT |  | Item 1.F. |
|  | main\_addr\_city | TEXT |  | Item 1.F. |
|  | main\_addr\_state | TEXT |  | Item 1.F. |
|  | main\_addr\_zip | TEXT |  | Item 1.F. |
|  | main\_addr\_country | TEXT |  | Item 1.F. |
|  | created\_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT\_TIMESTAMP | Record creation timestamp. |
|  | updated\_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT\_TIMESTAMP | Record last update timestamp. |
| **filings** | filing\_pk | SERIAL | PRIMARY KEY | Internal primary key. |
|  | adviser\_fk | INTEGER | NOT NULL, REFERENCES advisers(adviser\_pk) | Links to the adviser. |
|  | filing\_date | DATE | NOT NULL | Date the Form ADV was filed. |
|  | report\_period\_end\_date | DATE |  | The "as of" date for the data in the filing. |
|  | form\_type | TEXT |  | e.g., "ADV", "ADV-W". |
|  | total\_aum | BIGINT |  | Item 5.F.(2)(c) Total Regulatory Assets Under Management for this filing. |
|  | source\_file\_url | TEXT |  | URL or path to the original SEC data file. |
|  | parsed\_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT\_TIMESTAMP | Timestamp when this filing was parsed and loaded. |
| **private\_funds** | private\_fund\_pk | SERIAL | PRIMARY KEY | Internal primary key. |
|  | filing\_fk | INTEGER | NOT NULL, REFERENCES filings(filing\_pk) | Links to the specific filing this fund information pertains to. |
|  | sec\_pf\_id | TEXT | NOT NULL | Schedule D, Section 7.B.(1), Q.2. SEC-generated Private Fund ID. Should be unique per filing context. |
|  | fund\_name | TEXT |  | Schedule D, Section 7.B.(1), Q.1. |
|  | fund\_type | TEXT |  | Schedule D, Section 7.B.(1), Q.10 (e.g., "Hedge Fund", "Private Equity Fund"). |
|  | gross\_asset\_value | NUMERIC |  | Schedule D, Section 7.B.(1), Q.11. |
|  | min\_investment | NUMERIC |  | Schedule D, Section 7.B.(1), Q.12. |
|  | auditor\_name | TEXT |  | Schedule D, Section 7.B.(1), Q.23.a. |
|  | auditor\_location | TEXT |  | Schedule D, Section 7.B.(1), Q.23.b. |
|  | prime\_broker\_json | JSONB |  | Schedule D, Section 7.B.(1), Q.24 (can have multiple prime brokers). |
|  | custodian\_json | JSONB |  | Schedule D, Section 7.B.(1), Q.25 (can have multiple custodians). |
|  | is\_subject\_to\_audit | BOOLEAN |  | Schedule D, Section 7.B.(1), Q.23.a. (Interpreted from presence of auditor/audit details). |

*This schema is illustrative and should be expanded based on all required Form ADV items.*  
RIAs are required to update their Form ADV filings annually or more frequently if material changes occur. The IAPD system and historical data downloads provide access to these filings over time. To effectively "hunt" RIAs and understand their evolution, it is crucial to capture this temporal aspect. The proposed schema addresses this by including a Filings table. This table links to an Adviser and includes a filing\_date or report\_period\_end\_date. Consequently, most other data tables containing information that can change with each filing (such as PrivateFunds, ControlPersons, AUM figures) would link to a specific Filing instance rather than directly to the Adviser table for these volatile attributes. This design enables point-in-time analysis, allowing queries to reconstruct an adviser's profile as of a specific filing date and to track trends in AUM, private fund launches, or changes in control persons over multiple filing periods.  
While most Form ADV data fields can be mapped to structured relational columns, some sections, particularly within Schedule D or certain disclosure items, might contain highly variable information or deeply nested structures. For instance, a private fund might have multiple prime brokers or custodians, each with several pieces of identifying information \[, Schedule D Section 7.B.(1) Q.24, Q.25\]. Instead of creating many sparsely populated columns or complex related tables for every possible variation, PostgreSQL's JSONB data type can be strategically employed. Storing such variable or complex data as JSONB offers flexibility and simplifies the schema for less frequently queried or highly heterogeneous attributes. Supabase provides good support for querying JSONB data , allowing extraction of specific values if needed. However, it's important to strike a balance: fields that are frequently used in WHERE clauses, joins, or aggregations should generally be normalized into their own columns and indexed for optimal performance. Over-reliance on JSONB for core, frequently accessed data can degrade query performance compared to well-indexed, standard relational columns.

### **C. Indexing Strategy for Optimal Query Performance**

To ensure efficient data retrieval for the 'RIA Hunter' project, a thoughtful indexing strategy is necessary. Indexes should be created on:

* **Primary Keys:** Automatically indexed.  
* **Foreign Keys:** Essential for join performance.  
* **Frequently Queried Columns:**  
  * advisers.cik (for direct lookup)  
  * advisers.legal\_name (for searching by name, potentially with a trigram index for fuzzy matching)  
  * filings.filing\_date and filings.report\_period\_end\_date (for time-series analysis)  
  * private\_funds.sec\_pf\_id (for direct lookup)  
  * private\_funds.fund\_name  
  * private\_funds.fund\_type  
  * Numeric fields used in range queries or sorting (e.g., filings.total\_aum, private\_funds.gross\_asset\_value).  
* **Columns in JSONB:** If specific paths within JSONB columns are frequently queried, GIN indexes can be created on these paths.

Composite indexes may be beneficial for queries that filter or join on multiple columns simultaneously.

## **V. Implementing Data Loading into Supabase**

The ETL process will transform the acquired SEC data and load it into the defined Supabase schema. A key requirement is an "upsert" capability: inserting new records and updating existing ones if they are reprocessed (e.g., an updated Form ADV filing for an existing adviser).

### **A. Selecting Python Libraries for PostgreSQL Interaction**

Several Python libraries can facilitate interaction with Supabase's PostgreSQL backend.

* **1\. supabase-py:**  
  * **Pros:** As the official Python client for Supabase, it offers straightforward integration with Supabase-specific features (like Auth, Storage, Realtime, though these may not be immediately relevant for this ETL task). It provides a convenient upsert() method.  
  * **Cons:** May offer less flexibility for highly complex bulk operations or fine-grained SQL control compared to SQLAlchemy or direct database adapters.  
  * **Usage:** Initialize with create\_client(url, key). Perform upserts using supabase.table("table\_name").upsert(data, on\_conflict="column\_name").execute().  
* **2\. SQLAlchemy:**  
  * **Pros:** A powerful and mature Object-Relational Mapper (ORM) and SQL expression language. It is database-agnostic but provides strong dialect-specific support for PostgreSQL features, including INSERT... ON CONFLICT DO UPDATE statements. Excellent for managing complex queries, database sessions, and potentially schema migrations. Supports efficient bulk operations.  
  * **Cons:** Has a steeper learning curve than supabase-py for simple operations. The ORM layer can introduce some overhead if only basic insert/upsert operations are performed, but SQLAlchemy Core can be used for more direct SQL construction.  
  * **Usage:** Define ORM models corresponding to Supabase tables. For upserts, the PostgreSQL-specific insert().on\_conflict\_do\_update() construct is the most direct approach. Session.merge() offers some upsert-like capabilities but has specific semantics that may not always align with a simple "insert or update".  
* **3\. psycopg2 / asyncpg:**  
  * **Pros:** These are low-level, high-performance PostgreSQL adapters for Python. psycopg2 is the traditional synchronous adapter , while asyncpg is a modern, fast asynchronous adapter designed for use with asyncio. They offer maximum control over the SQL executed.  
  * **Cons:** Require writing raw SQL for all operations, including upserts. More boilerplate code is needed for connection management, cursor handling, and transaction control.  
  * **Usage:** Establish a connection, create a cursor, and execute raw SQL INSERT... ON CONFLICT DO UPDATE... statements, using parameterized queries to prevent SQL injection.

**Table: Comparison of Python-PostgreSQL Interaction Libraries for 'RIA Hunter' ETL**

| Feature | supabase-py | SQLAlchemy (Core/ORM) | psycopg2 / asyncpg |
| :---- | :---- | :---- | :---- |
| **Abstraction Level** | High (Supabase specific) | Medium to High (ORM / SQL Expression) | Low (Direct SQL) |
| **Ease of Upsert** | Simple (.upsert() method) | Moderate (PostgreSQL dialect specific) | Manual SQL construction |
| **Bulk Operations** | Supports list for bulk upsert | Good (ORM batching, Core execute) | Excellent (execute\_values, execute\_batch) |
| **Performance** | Good for typical use cases | Good to Excellent (Core is very fast) | Excellent (especially asyncpg) |
| **Learning Curve** | Low | Medium to High | Medium (SQL knowledge assumed) |
| **Supabase Integration** | Native | General PostgreSQL | General PostgreSQL |
| **Flexibility/Control** | Moderate | High | Very High |

For the 'RIA Hunter' project, **SQLAlchemy** is recommended as the primary library for database interaction due to its balance of abstraction, power, and explicit support for PostgreSQL's ON CONFLICT clause, which is ideal for the required upsert logic. supabase-py can be a useful secondary tool for very simple interactions or if other Supabase-specific services are leveraged later.

### **B. Designing the ETL Data Pipeline for SEC Data**

The ETL pipeline will consist of the following stages:

1. **Extraction:**  
   * Fetch current IAPD XML compilation reports and XSDs using requests.  
   * Fetch historical data (ZIP archives containing CSVs) using requests.  
   * Unzip archives using the zipfile module.  
2. **Transformation:**  
   * **XML:** Parse with lxml, validate against XSD. Extract relevant data fields based on the defined Supabase schema.  
   * **CSV:** Load with pandas. Clean data (handle missing values, incorrect types), merge/join tables as necessary to create a unified record structure.  
   * **Common:** Apply Unicode normalization (e.g., unicodedata.normalize('NFKC',...)). Resolve any text inconsistencies using regex if needed. Transform data values to match the target Supabase column types.  
3. **Loading:**  
   * Connect to the Supabase PostgreSQL database using SQLAlchemy.  
   * Perform batched upsert operations into the target tables.

**Workflow Considerations:**

* **Error Handling:** Implement robust error handling at each stage (e.g., network errors during download, parsing errors, database errors). Log errors comprehensively.  
* **Logging:** Maintain detailed logs of operations, including files processed, records added/updated, and any errors encountered.  
* **Batch Processing:** Process large files or datasets in manageable batches to control memory usage and allow for resumability.  
* **Idempotency:** The entire ETL process must be idempotent. This means that running the pipeline multiple times with the same input data should yield the identical state in the database. The upsert logic is fundamental to achieving idempotency.

### **C. Implementing Efficient Upsert (INSERT ON CONFLICT) Logic**

The core of the loading process is the upsert mechanism to ensure data is current without creating duplicates.  
**1\. Using supabase-py's upsert method (Alternative):** If supabase-py were chosen, the syntax would be: response \= supabase.table("your\_table").upsert(list\_of\_dicts, on\_conflict="unique\_column\_or\_constraint\_name").execute(). Primary keys must be included in the dictionaries for upsert to function correctly by identifying existing rows. The on\_conflict parameter is crucial for specifying which column(s) with a UNIQUE constraint should trigger an update instead of an insert.  
**2\. Leveraging SQLAlchemy's dialect-specific features for PostgreSQL (Recommended):** This approach offers more control and aligns well with using SQLAlchemy for schema interaction.  
`from sqlalchemy.dialects.postgresql import insert`  
`from sqlalchemy.orm import Session`  
`# Assuming 'engine' is your SQLAlchemy engine connected to Supabase`  
`# Assuming 'YourTable' is your SQLAlchemy ORM model or Table object`  
`# Assuming 'data_to_upsert' is a list of dictionaries`

`with Session(engine) as session:`  
    `for record_batch in batch_records(data_to_upsert, size=1000): # Helper to batch records`  
        `stmt = insert(YourTable).values(record_batch)`  
        `# Define what to do on conflict`  
        `# 'excluded' refers to the values that would have been inserted`  
        `update_dict = {`  
            `c.name: getattr(stmt.excluded, c.name)`  
            `for c in YourTable.__table__.columns`  
            `if not c.primary_key and c.name in record_batch # Update non-PK columns present in input`  
        `}`  
          
        `# Specify the conflict target (e.g., a unique constraint on 'cik' or primary key)`  
        `# For a table with a 'cik' column that has a unique constraint:`  
        `# final_stmt = stmt.on_conflict_do_update(`  
        `#     index_elements=['cik'],  # Column(s) causing the conflict`  
        `#     set_=update_dict`  
        `# )`  
        `# For a table with a primary key 'id':`  
        `final_stmt = stmt.on_conflict_do_update(`  
            `constraint=YourTable.__table__.primary_key, # Or specific constraint name`  
            `set_=update_dict`  
        `)`  
          
        `session.execute(final_stmt)`  
    `session.commit()`

This example demonstrates batching and using on\_conflict\_do\_update. The index\_elements or constraint parameter specifies the conflict target (e.g., the cik column if it has a unique constraint, or the primary key). The set\_ argument defines which columns to update, using stmt.excluded.column\_name to refer to the values from the row that was attempted to be inserted.  
The selection of the ON CONFLICT target is of paramount importance for the correct behavior of the upsert operation. PostgreSQL's ON CONFLICT clause requires a conflict\_target, which can be specified as ON CONSTRAINT constraint\_name or by listing the (index\_column\_name,...) that form a unique index, possibly with an index\_predicate for partial indexes. If this target is misconfigured—for example, if it points to a set of columns that are not actually unique, or references a non-existent or incorrect constraint name—the upsert logic will fail. It might always insert new rows (leading to duplicates if the intended uniqueness is not enforced by the specified target), always raise an error, or, in the worst case, update incorrect rows. Therefore, the Supabase schema defined in Section IV must feature clearly defined UNIQUE constraints or primary keys (e.g., adv\_cik in the advisers table, sec\_pf\_id along with filing\_fk in the private\_funds table) that will serve as the precise conflict\_target in the on\_conflict\_do\_update statement. The data loading script must then accurately reference these constraints or columns to ensure that data is correctly inserted or updated.  
**3\. Direct SQL execution with psycopg2 or asyncpg (Lower-level alternative):** This would involve constructing the raw SQL string: INSERT INTO your\_table (col1, col2,...) VALUES (%s, %s,...) ON CONFLICT (conflict\_target\_column) DO UPDATE SET col1 \= EXCLUDED.col1, col2 \= EXCLUDED.col2,...;. The conflict\_target\_column must have a unique constraint. EXCLUDED.column\_name refers to the values from the row that caused the conflict. Parameterized queries are essential to prevent SQL injection.  
**Batching Upserts:** For large datasets, such as the full IAPD XML files or extensive historical CSVs, performing upserts row-by-row will be highly inefficient. Batching is critical.

* With supabase-py, the upsert() method can accept a list of dictionaries for bulk operations.  
* With SQLAlchemy, one common approach is to execute the insert().on\_conflict\_do\_update() statement with a list of value dictionaries, which SQLAlchemy can often translate into efficient multi-row DML for supported backends like PostgreSQL.  
* With psycopg2, psycopg2.extras.execute\_values() or execute\_batch() are highly efficient for bulk inserts and can be adapted for upserts by constructing the appropriate ON CONFLICT SQL. asyncpg offers similar high-performance batch execution methods.

The performance of bulk upsert operations can vary significantly depending on the chosen library and the specific implementation strategy. While supabase-py's upsert method accepting a list of dictionaries offers convenience, its underlying efficiency for very large batches (e.g., tens of thousands or hundreds of thousands of records) should be benchmarked. SQLAlchemy's Core layer, when used to construct INSERT... ON CONFLICT statements with multiple VALUES clauses, can be very performant. Direct use of psycopg2's execute\_values or asyncpg's batch methods, coupled with the correct ON CONFLICT SQL, typically offers the highest throughput for raw database operations. Given the potential volume of RIA data, especially if processing historical data, the chosen method's bulk operation capabilities must be carefully evaluated. If the higher-level abstractions prove insufficient in terms of speed, a more direct approach using SQLAlchemy Core or even psycopg2/asyncpg for the loading step might become necessary.  
When loading data in batches, especially large volumes, ensuring data integrity is paramount. Each batch of upsert operations should be wrapped within a database transaction. If an error occurs during the processing or loading of a batch (e.g., a data validation error, a network issue, or a database constraint violation not handled by the ON CONFLICT clause), the entire transaction for that batch can be rolled back. This prevents partial data loads, where some records from a batch are committed while others are not, leading to an inconsistent database state. Libraries like psycopg2 and SQLAlchemy provide explicit transaction control mechanisms (connection.commit(), connection.rollback(), or session-based transaction management in SQLAlchemy). The ETL script must implement this transaction handling rigorously to safeguard data consistency throughout the loading process.

## **VI. Python Library Ecosystem for 'RIA Hunter'**

Selecting an appropriate and well-managed set of Python libraries is crucial for the development, maintainability, and scalability of the 'RIA Hunter' project.

### **A. Core Libraries and Their Roles**

* **requests**: Essential for making HTTP GET and POST requests to download XML files, CSVs, and interact with SEC APIs. Its simplicity and robustness make it the standard choice for HTTP interactions.  
* **lxml**: The primary library for parsing and validating SEC XML data (specifically Form ADV). Its advantages include high performance, efficient memory usage for large files, comprehensive XPath 1.0 support, and XSD validation capabilities, which are critical for handling complex SEC schemas.  
* **pandas**: Indispensable for handling tabular data, particularly the historical SEC data provided in CSV format. It will be used for reading CSVs, data cleaning, transformation, merging datasets, and potentially as an intermediate data structure before loading into Supabase. pandas also supports reading Parquet files, often using pyarrow as an engine, should this format become relevant.  
* **SQLAlchemy (Recommended for Database Interaction)**: This library provides a powerful ORM and a flexible SQL Expression Language, making it ideal for interacting with the Supabase (PostgreSQL) database. Its dialect-specific support for PostgreSQL's INSERT... ON CONFLICT DO UPDATE syntax is perfectly suited for the project's upsert requirements. SQLAlchemy also aids in schema definition, and its migration tools (like Alembic, though not explicitly requested, are a natural fit) can be invaluable for managing database schema evolution over time.  
* **supabase-py (Alternative/Complementary for Database Interaction)**: While SQLAlchemy is recommended for core ETL database operations, supabase-py can be useful for simpler, direct interactions with Supabase or if the project later expands to use other Supabase-specific features (e.g., authentication, real-time subscriptions, storage). Its upsert() method offers a convenient high-level interface.  
* **regex (Recommended for Regex Tasks)**: As discussed in Section II, the regex library should be used for all regular expression tasks, including resolving the initial failure and any subsequent complex text pattern matching. Its superior Unicode support, advanced features, and more predictable behavior make it a better choice than the standard re module for handling the varied text data from SEC filings.

### **B. Specialized and Utility Libraries**

* **unicodedata**: A Python standard library module essential for Unicode normalization (NFC, NFD, NFKC, NFKD). This will be used in the data transformation phase to ensure text consistency before regex processing or database loading.  
* **binascii**: Another standard library module, useful for conversions between binary and ASCII-encoded binary representations, particularly for inspecting byte sequences via hexadecimal encoding (hexlify, unhexlify) during debugging.  
* **zipfile**: A standard library module required for working with ZIP archives, as historical SEC data is often distributed in this format.  
* **pyarrow**: This library may become relevant if Parquet files are used for intermediate data storage or if the SEC begins to offer data in this efficient columnar format. pandas can leverage pyarrow as an engine for reading and writing Parquet files. The pyarrow.parquet.read\_table function offers more granular control over Parquet reading if needed.  
* **Web Scraping Libraries (Contingency Only)**:  
  * **BeautifulSoup4**: For parsing HTML/XML content if web scraping becomes a necessary fallback.  
  * **Selenium** or **Playwright** : For interacting with dynamic, JavaScript-heavy websites if essential data cannot be obtained through official feeds or APIs.

The choice of XML parser, specifically between lxml and the standard library's xml.etree.ElementTree, carries significant performance and feature implications, especially when processing large SEC files. The IAPD XML compilation reports can be substantial in size (e.g., the SEC Investment Adviser Report XML is cited as approximately 73 MB ). lxml, being a C-based wrapper around libxml2 and libxslt, is renowned for its speed and memory efficiency when handling large XML documents, often outperforming xml.etree.ElementTree by a considerable margin. Furthermore, lxml provides comprehensive support for XPath 1.0, which is invaluable for navigating complex XML structures, and robust XSD validation capabilities, crucial for ensuring the integrity of the SEC data. For the 'RIA Hunter' project, which will routinely process these large and complex XML files, standardizing on lxml is a strategic decision that prioritizes performance and data reliability. The benefits in processing speed, reduced memory footprint, and advanced validation features will likely outweigh the minor overhead of managing an external C dependency.  
A layered approach to database interaction may prove optimal for the 'RIA Hunter' project. While SQLAlchemy offers a powerful ORM and Core SQL expression language, beneficial for complex data modeling, schema management, and sophisticated querying, supabase-py provides a simpler, more direct interface for interacting with Supabase-specific functionalities, should they be needed beyond basic database operations. For the most performance-critical bulk data loading tasks, particularly large-scale upserts, even more direct methods like psycopg2's execute\_values or asyncpg's highly optimized batch methods could be considered after careful benchmarking. This tiered strategy avoids a "one-size-fits-all" constraint, allowing the project to use the most appropriate tool for each specific database interaction scenario—SQLAlchemy for general ORM and complex queries, supabase-py for quick Supabase-centric tasks, and potentially lower-level adapters for specialized high-throughput ETL stages.

### **C. Dependency Management and Documentation Best Practices**

* **Virtual Environments:** The use of Python virtual environments (e.g., via venv or conda) is strongly recommended. This isolates project dependencies, preventing conflicts with system-wide packages or other projects.  
* **Dependency Manifest:** Project dependencies and their versions should be explicitly listed in a manifest file. A requirements.txt file (generated via pip freeze) is a common approach. For more modern dependency management and packaging, using pyproject.toml with tools like Poetry or PDM is advisable.  
* **Version Pinning:** It is good practice to pin the versions of dependencies in the manifest file (e.g., requests==2.25.1, lxml\~=4.6). This ensures reproducible builds and protects the project from unexpected breaking changes introduced by newer versions of libraries. Pinning to a major version (e.g., lxml\~=4.0) or a specific minor version allows for compatible updates while preventing major breaking changes.  
* **Documentation:** Thoroughly document the chosen libraries, their specific versions, and any custom configurations. Explain the rationale behind selecting a particular library for a specific task. This documentation is vital for onboarding new developers and for long-term project maintainability.

## **VII. Conclusion and Strategic Recommendations**

This report has outlined a multi-faceted approach to advance the 'RIA Hunter' project, addressing the initial regex failure and laying a robust foundation for SEC data acquisition, storage, and processing. The core solutions involve leveraging the regex library and unicodedata for text processing, prioritizing IAPD XML compilation feeds for primary SEC data, defining a normalized relational schema in Supabase, and implementing efficient data loading using SQLAlchemy with PostgreSQL's ON CONFLICT capabilities.  
The recommended Python library stack, centered around lxml for XML parsing, pandas for tabular data manipulation, the regex library for advanced pattern matching, and SQLAlchemy for database interaction, provides a powerful and flexible toolkit. Adherence to best practices in dependency management and thorough documentation will ensure the project's long-term viability.  
A **phased implementation plan** is recommended:

* **Phase 1: Stabilize and Acquire Core Data:**  
  1. Resolve the immediate regex failure in src/etl/transform.py using unicodedata and the regex library.  
  2. Implement robust data acquisition scripts to download and parse the IAPD XML Compilation Reports (SEC Investment Adviser Report and Firm XSD).  
  3. Focus parsing on essential Form ADV Part 1A items (e.g., identifying information, AUM, key personnel).  
  4. Define and implement the initial Supabase schema for the Advisers and Filings tables.  
  5. Implement the initial data loading pipeline with batched upserts for this core data.  
* **Phase 2: Deepen Data Coverage and Incorporate History:**  
  1. Expand XML parsing to include the entirety of Form ADV Part 1A, with a particular focus on Schedule D, Section 7.B.(1) for private fund details.  
  2. Refine and extend the Supabase schema to accommodate this richer dataset (e.g., PrivateFunds, ControlPersons, Affiliations tables).  
  3. Develop scripts to acquire and process historical Form ADV data from the CSV/ZIP archives. This will involve significant data transformation and mapping to the current schema.  
  4. Implement logic to link historical data correctly to adviser and filing records.  
* **Phase 3: Optimize, Extend, and Analyze:**  
  1. Benchmark and optimize the data loading pipeline, particularly the bulk upsert operations.  
  2. Investigate the utility of SEC EDGAR APIs for supplementary data if specific needs arise (e.g., cross-referencing with other company filings).  
  3. Begin development of analytical queries and the core "hunter" features based on the populated database.  
  4. Implement data quality checks and validation routines throughout the ETL pipeline.

**Future Considerations:**

* **Automated Monitoring:** Implement systems to monitor SEC data sources for changes in data formats, API endpoints, or XSD versions to ensure the ETL pipeline remains functional.  
* **Data Quality Framework:** Establish a comprehensive data quality framework, including automated checks for completeness, accuracy, and consistency of the ingested SEC data.  
* **Scalability:** As the volume of data grows (especially with historical data and ongoing updates), continually assess and optimize the performance of the database and ETL processes. This might involve refining indexing strategies, optimizing queries, or scaling Supabase resources.  
* **Asynchronous Processing:** For I/O-bound tasks within the ETL pipeline (e.g., downloading multiple files, making numerous database calls), explore the use of Python's asyncio framework along with asynchronous libraries like aiohttp (for HTTP requests) and asyncpg (for database interaction) to potentially improve throughput and efficiency.

By systematically addressing these technical areas and adopting the recommended strategies and libraries, the 'RIA Hunter' project can build a reliable, scalable, and insightful platform for analyzing Registered Investment Adviser data.

#### **Works cited**

1\. unicodedata — Unicode Database — Python 3.13.3 documentation, https://docs.python.org/3/library/unicodedata.html 2\. Unicode HOWTO — Python 3.13.3 documentation, https://docs.python.org/3/howto/unicode.html 3\. re — Regular expression operations — Python 3.13.3 documentation, https://docs.python.org/3/library/re.html 4\. regex · PyPI, https://pypi.org/project/regex/ 5\. Working with Unicode in Python | GeeksforGeeks, https://www.geeksforgeeks.org/working-with-unicode-in-python/ 6\. bytes.hex() Method – Python \- GeeksforGeeks, https://www.geeksforgeeks.org/bytes-hex-method-python/ 7\. Convert Bytearray to Hexadecimal String – Python \- GeeksforGeeks, https://www.geeksforgeeks.org/python-convert-bytearray-to-hexadecimal-string/ 8\. binascii — Convert between binary and ASCII — Python 3.13.3 ..., https://docs.python.org/3/library/binascii.html 9\. What is binascii.hexlify in Python? \- Educative.io, https://www.educative.io/answers/what-is-binasciihexlify-in-python 10\. Convert Hex String to Bytes in Python | GeeksforGeeks, https://www.geeksforgeeks.org/convert-hex-string-to-bytes-in-python/ 11\. 6.2. re — Regular expression operations — Python 3.4.2 documentation, https://www.cmi.ac.in/\~madhavan/courses/prog2-2015/docs/python-3.4.2-docs-html/library/re.html 12\. IAPD \- Investment Adviser Public Disclosure \- Homepage \- SEC.gov, https://adviserinfo.sec.gov/compilation 13\. Information About Registered Investment Advisers and Exempt Reporting Advisers, https://www.sec.gov/data-research/sec-markets-data/information-about-registered-investment-advisers-exempt-reporting-advisers 14\. Appendix B: Form ADV: Instructions for Part 1A \- SEC.gov, https://www.sec.gov/files/rules/final/2016/ia-4509-appendix-b.pdf 15\. Investment Adviser Public Disclosure \- Homepage \- IAPD, https://adviserinfo.sec.gov/adv 16\. Form ADV Data \- SEC.gov, https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data 17\. EDGAR Application Programming Interfaces (APIs) \- SEC.gov, https://www.sec.gov/edgar/sec-api-documentation 18\. SEC EDGAR Filings API, https://sec-api.io/ 19\. Chapter 13 XML: Managing Data Exchange | DataManagement.knit \- Richard T. Watson, https://www.richardtwatson.com/open/Reader/\_book/xml-managing-data-exchange.html 20\. Technical Specifications \- SEC.gov, https://www.sec.gov/submit-filings/technical-specifications 21\. What Is SEC Form ADV? Definition, Requirements, and How to File, https://www.investopedia.com/terms/f/form\_adv.asp 22\. Form ADV Part 1: Common Missteps And Best Practices For RIAs, https://www.kitces.com/blog/form-adv-part-1-rias-mistakes-best-practices/ 23\. Form ADV | SEC.gov, https://www.sec.gov/about/forms/formadv.pdf 24\. Considerations for the Home Stretch of Form ADV Updates for 2024 | Insights \- Mayer Brown, https://www.mayerbrown.com/en/insights/publications/2024/03/considerations-for-the-home-stretch-of-form-adv-updates-for-2024 25\. SEC Amendments to Form ADV and the “Books and Records” Rule under the Advisers Act | Clifford Chance, https://www.cliffordchance.com/content/dam/cliffordchance/briefings/2016/09/sec-amendments-to-form-adv-and-the-books-and-records-rule-under-the-advisers-act.pdf 26\. BeautifulSoup4 Module – Python | GeeksforGeeks, https://www.geeksforgeeks.org/beautifulsoup4-module-python/ 27\. Web Scraping with BeautifulSoup \- For Beginners, https://www.kaggle.com/code/gauravkumar2525/web-scraping-with-beautifulsoup-for-beginners 28\. The Python Selenium Guide \- Web Scraping With Selenium \- ScrapeOps, https://scrapeops.io/selenium-web-scraping-playbook/python-selenium/ 29\. Web Scraping Tutorial Using Selenium & Python (+ examples) \- ScrapingBee, https://www.scrapingbee.com/blog/selenium-python/ 30\. Selenium Python Tutorial | GeeksforGeeks, https://www.geeksforgeeks.org/selenium-python-tutorial/ 31\. WebDriver | Selenium, https://www.selenium.dev/documentation/webdriver/ 32\. Web Scraping with Playwright and Python: A Developer's Guide \- DEV Community, https://dev.to/alex\_aslam/web-scraping-with-playwright-and-python-a-developers-guide-3i48 33\. Web Scraping with Playwright and JavaScript \- DEV Community, https://dev.to/scrapfly\_dev/web-scraping-with-playwright-and-javascript-fjl 34\. playwright \- PyPI, https://pypi.org/project/playwright/ 35\. Fast and reliable end-to-end testing for modern web apps | Playwright Python, https://playwright.dev/python/ 36\. Installation | Playwright Python, https://playwright.dev/python/docs/intro 37\. Python: Fetch data | Supabase Docs, https://supabase.com/docs/reference/python/select 38\. Python: Initializing | Supabase Docs, https://supabase.com/docs/reference/python/initializing 39\. Python: Upsert data | Supabase Docs, https://supabase.com/docs/reference/python/upsert 40\. SQLAlchemy Documentation — SQLAlchemy 2.0 Documentation, https://docs.sqlalchemy.org/ 41\. ORM Querying Guide — SQLAlchemy 2.0 Documentation, http://docs.sqlalchemy.org/en/latest/orm/queryguide/ 42\. The easiest way to UPSERT with SQLAlchemy \- Towards Data Science, https://towardsdatascience.com/the-easiest-way-to-upsert-with-sqlalchemy-9dae87a75c35/ 43\. PostgreSQL database adapter for Python \- Psycopg documentation, https://access.crunchydata.com/documentation/psycopg3/3.1.9/ 44\. Introduction to Psycopg2 module in Python \- GeeksforGeeks, https://www.geeksforgeeks.org/introduction-to-psycopg2-module-in-python/ 45\. Introduction — Psycopg 2.5.1 documentation, https://www.doc.ic.ac.uk/project/2012/wmproject2013/chandra/psycopg2-2.5.1/doc/html/install.html 46\. psycopg2 \- PyPI, https://pypi.org/project/psycopg2/ 47\. PostgreSQL database adapter for Python — Psycopg 2.9 ... \- Psycopg, https://www.psycopg.org/docs/ 48\. asyncpg | Sentry for Python, https://docs.sentry.io/platforms/python/integrations/asyncpg/ 49\. MagicStack/asyncpg: A fast PostgreSQL Database Client Library for Python/asyncio. \- GitHub, https://github.com/MagicStack/asyncpg 50\. asyncio — Asynchronous I/O — Python 3.13.3 documentation, https://docs.python.org/3/library/asyncio.html 51\. asyncpg — asyncpg Documentation, https://magicstack.github.io/asyncpg/current/ 52\. PostgreSQL Upsert: INSERT ON CONFLICT Guide \- DbVisualizer, https://www.dbvis.com/thetable/postgresql-upsert-insert-on-conflict-guide/ 53\. PostgreSQL UPSERT using INSERT ON CONFLICT Statement \- Neon, https://neon.tech/postgresql/postgresql-tutorial/postgresql-upsert 54\. Comprehensive Guide to SEC EDGAR API and Database \- Daloopa, https://daloopa.com/blog/comprehensive-guide-to-sec-edgar-api-and-database 55\. pandas.read\_parquet — pandas 0.24.0 documentation, https://pandas.pydata.org/pandas-docs/version/0.24.0/reference/api/pandas.read\_parquet.html 56\. modin.pandas.read\_parquet \- Snowflake Documentation, https://docs.snowflake.com/ko/developer-guide/snowpark/reference/python/latest/modin/pandas\_api/modin.pandas.read\_parquet 57\. pandas.read\_parquet — pandas 2.2.3 documentation \- PyData |, https://pandas.pydata.org/docs/reference/api/pandas.read\_parquet.html 58\. pandas.read\_parquet — pandas 2.2.3 documentation, https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.read\_parquet.html 59\. binascii (Jython API documentation) \- javadoc.io, https://www.javadoc.io/static/org.python/jython/2.5.3/org/python/modules/binascii.html 60\. polars.read\_parquet — Polars documentation, https://docs.pola.rs/py-polars/html/reference/api/polars.read\_parquet.html 61\. pyarrow.parquet.read\_table — Apache Arrow v3.0.0 \- enpiar.com, https://enpiar.com/arrow-site/docs/python/generated/pyarrow.parquet.read\_table.html 62\. pyarrow.parquet.read\_table — Apache Arrow v20.0.0, https://arrow.apache.org/docs/python/generated/pyarrow.parquet.read\_table.html