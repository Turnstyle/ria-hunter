# Plan: Identifying the Top St. Louis RIA for Private Placements in the Last Year

## A. Confirm Data Availability (Schedule D 7.B(1) Private Fund Data)

First, let's verify that we have the necessary **Schedule D Section 7.B(1)** data (private fund information) for the analysis. According to the repository structure, the raw ADV filing data is stored in monthly CSV files under raw/ADV\_Filing\_Data\_YYYYMMDD\_YYYYMMDD/. Specifically, we expect to find **Investment Adviser (IA) Schedule D 7.B(1)** filings and possibly **Exempt Reporting Adviser (ERA) 7.B(1)** as well.

**Action:** List the files for recent months to ensure we have data covering roughly the last 12 months (the question asks "within the last year"). We will focus on IA data (registered investment advisers) unless ERA data is needed.

\# List raw ADV filing data folders for 2024 and 2025 to identify available files  
ls \-1 raw/ADV\_Filing\_Data\_\* | grep "Schedule\_D\_7B1"

*Expected outcome:* A list of CSV files such as IA\_Schedule\_D\_7B1\_YYYYMMDD\_YYYYMMDD.csv for each time period. We should see files from mid-2024 up to the most recent (likely mid-2025 if data is updated through July 2025). These files contain private fund details per filing.

Let's preview one of the files (e.g., the most recent one) to confirm the structure and relevant columns:

\# Peek at the header of the latest IA Schedule D 7.B(1) file (e.g., July 2025\)  
head \-5 raw/ADV\_Filing\_Data\_20250701\_20250731/IA\_Schedule\_D\_7B1\_20250701\_20250731.csv

This should display column names and a sample row. Typical fields we expect in 7.B(1) data include: \- **Filing ID** (to link back to the adviser’s main filing) \- **Fund Name** \- **Fund ID** (SEC identifier for the fund) \- **Fund Type** \- **Gross Asset Value** (of the fund) \- **Minimum Investment** \- **Number of Investors or Owners** \- Possibly service provider info (prime brokers, custodians, etc.)

We also have **Schedule D Section 7.B(2)** files (fund of funds info) if needed, but likely 7.B(1) is sufficient for basic fund counts and values.

*Verification:* We have confirmed that the raw data for private funds is present for the time frame needed (the last year). Now, we will proceed to use this data to identify the RIA with the most private placement activity in St. Louis, MO.

## B. Plan to Identify the Top St. Louis RIA by Private Placement Activity

To determine **which RIA in St. Louis, MO has done the most private placement activity within the last year**, we'll follow these steps:

### 1\. **Load and Combine Relevant Data**

We need to aggregate data from multiple files and link it with adviser information:

* **ADV Base Data**: Contains adviser details including name, location (city, state, zip), and a unique Filing ID or CRD number.

* **Schedule D 7.B(1) Data**: Contains private fund info per filing (multiple funds per adviser possible, each fund is a record).

**Plan:** \- Read all the IA Schedule D 7.B(1) CSV files covering approximately the last 12 months (for example, August 2024 through July 2025). We can combine them into one DataFrame for analysis. \- Read the corresponding **ADV Part 1 Base** data for the same filings, to get RIA names and locations. The base filings likely reside in files like IA\_ADV\_Base\_A\_YYYYMMDD\_YYYYMMDD.csv (Section 1A of Form ADV Part 1, which includes firm name, address, etc.). \- **Join** the 7.B(1) data with the base data on the common identifier (e.g., FilingID or a similar key present in both files, often a combination of adviser ID and filing timestamp).

**Implementation (using pandas):**

import pandas as pd  
from glob import glob

\# 1\. Load and concatenate all IA Schedule D 7.B(1) files for the last year  
file\_pattern \= "raw/ADV\_Filing\_Data\_2024\*/\*IA\_Schedule\_D\_7B1\*.csv"  
file\_pattern\_2 \= "raw/ADV\_Filing\_Data\_2025\*/\*IA\_Schedule\_D\_7B1\*.csv"  
files \= glob(file\_pattern) \+ glob(file\_pattern\_2)

df\_funds \= pd.concat(\[pd.read\_csv(f) for f in files\], ignore\_index=True)

\# 2\. Load and concatenate corresponding ADV Part 1 base files (Section 1A data for firm info)  
base\_files\_pattern \= "raw/ADV\_Filing\_Data\_2024\*/\*IA\_ADV\_Base\_A\*.csv"  
base\_files\_pattern\_2 \= "raw/ADV\_Filing\_Data\_2025\*/\*IA\_ADV\_Base\_A\*.csv"  
base\_files \= glob(base\_files\_pattern) \+ glob(base\_files\_pattern\_2)

df\_adv\_base \= pd.concat(\[pd.read\_csv(f) for f in base\_files\], ignore\_index=True)

\# 3\. Inspect columns to identify join key  
print("Fund columns:", df\_funds.columns.tolist()\[:10\])  
print("Base columns:", df\_adv\_base.columns.tolist()\[:10\])

This will load the data into DataFrames and print the columns of each to identify the key (likely something like Filing ID or Adviser CRD Number along with a filing date). We might need to adjust the join key based on actual column names: \- Common keys might be AdviserCRD or SEC Number plus FilingDate or an explicit FilingID. \- Often, the base file has a unique ID for each filing that can match multiple schedule entries.

Assuming there's a column like FilingID in both (as indicated in the snippet), we'll join on that.

\# 4\. Join fund data with base data to associate each fund with adviser name and location  
\# (Using a guessed key 'FilingID' – update if actual key name differs)  
df\_merged \= pd.merge(df\_funds, df\_adv\_base, on="FilingID", how="inner")

\# Confirm the join by checking a few records  
print(df\_merged\[\['FilingID','Fund Name','Investment Adviser Name','City','State','Zip'\]\].head(5))

*Note:* If FilingID isn’t present, we may use Adviser CRD Number or SEC Number combined with filing date. The ADV base files might have one row per filing per adviser, so CRD \+ FilingDate might uniquely identify a filing.

### 2\. **Filter for St. Louis, Missouri Advisers**

We only want RIAs based in **St. Louis, MO (Missouri)**. The definition of "St. Louis, MO" could be: \- Firms with city **"ST. LOUIS"** (or variations like "Saint Louis") and state **"MO"** in their address. \- Possibly include suburbs if "St. Louis metropolitan area" is intended (the earlier context mentioned a set of zip codes for St. Louis MSA in a geography.py). If needed, we can broaden to known St. Louis area zip codes or counties. But likely, the question specifically says "in St. Louis, MO", implying city of St. Louis.

**Plan:** Filter the merged DataFrame to include only rows where the firm's city and state match St. Louis, MO. We should consider variations in spelling/casing.

\# 5\. Filter for St. Louis, MO (case insensitive match on city "St. Louis" and state "MO")  
df\_stl \= df\_merged\[  
    (df\_merged\['City'\].str.lower().str.contains("st. louis")) &   
    (df\_merged\['State'\].str.upper() \== "MO")  
\]

\# If needed, include common suburbs or alternative city names in St. Louis area:  
\# For example, Clayton, Chesterfield, etc., if we interpret "St. Louis" broadly.  
\# But we'll start with strict city match.  
print("Total records for St. Louis, MO advisers:", len(df\_stl))  
print("Example St. Louis adviser records:", df\_stl\[\['Investment Adviser Name','City','State'\]\].drop\_duplicates().head(5))

This will filter the data to only include private fund entries for advisers in St. Louis, Missouri. Each entry corresponds to one fund in one filing. An adviser can appear multiple times if they have multiple private funds.

### 3\. **Filter for Time Frame: Last 12 Months**

We need to restrict to *within the last year*. Assuming "last year" means roughly the last 12 months from today (and today is Aug 4, 2025 as per system date).

**Plan:** If the data is broken out by filing dates (the folders are per month), we likely have filings from mid-2024 to mid-2025. We should filter the filings to those after, say, August 1, 2024\. If there's a column for filing date or update date in the data, use it. If not, we infer from file batches: \- We have data up to July 2025, so include everything from August 2024 onward.

We can filter by a date field if present (like FilingDate or the file date range). If no explicit date column, we might rely on file names or assume each file is within its month.

For accuracy, let's check if df\_adv\_base or df\_funds has a date column (like FilingDate or PeriodEnd).

\# 6\. Check for a filing date or report date column in base data  
date\_cols \= \[col for col in df\_adv\_base.columns if "Date" in col or "Period" in col\]  
print("Date-related columns in base data:", date\_cols)

If a date is available, filter on it:

from datetime import datetime, timedelta

one\_year\_ago \= datetime(2025, 8, 4\) \- timedelta(days=365)  
one\_year\_ago\_str \= one\_year\_ago.strftime("%Y-%m-%d")

\# Suppose 'FilingDate' is a column:  
df\_stl\_last\_year \= df\_stl\[pd.to\_datetime(df\_stl\['FilingDate'\]) \>= one\_year\_ago\]

If no date column, we might trust the file coverage. Since we loaded data from 2024 and 2025 files, we can manually filter if needed by which file it came from or assume our dataset already only contains the needed period (if we limited file glob patterns accordingly).

*(We'll assume the data load included Aug 2024 onward. If not, adjust the file glob pattern to start from that date.)*

### 4\. **Define "Most Private Placement Activity"**

This could be interpreted in a few ways. We should clarify what metric signifies "private placement activity": \- **Number of Private Funds** managed in the last year. \- **Total Gross Asset Value** of those private funds. \- Possibly **number of new fund offerings** (if multiple filings or new funds launched). \- Or a combination of these.

For simplicity and objectivity, let's consider **number of private funds (count)** in the last year as the primary metric, and use **gross asset value** as a secondary insight (since AUM could indicate scale of activity).

**Plan:** Group the St. Louis data by RIA (investment adviser name or a unique ID for the firm) and aggregate: \- Count of fund entries (this effectively counts how many private funds they reported). \- Sum of gross asset values (if available and meaningful). \- Possibly count of distinct offerings or filings.

Then identify the top firm by the count. If there’s a tie, gross asset value could be a tiebreaker.

\# 7\. Aggregate private fund data by adviser  
group\_col \= 'Investment Adviser Name'  \# assuming this column exists for firm name  
df\_summary \= df\_stl\_last\_year.groupby(group\_col).agg(  
    num\_private\_funds \= ('Fund Name', 'count'),  
    total\_gross\_assets \= ('Gross Asset Value', 'sum')  \# if Gross Asset Value is numeric  
).reset\_index()

\# Sort by number of funds (and then by assets as secondary sort)  
df\_summary.sort\_values(\['num\_private\_funds','total\_gross\_assets'\], ascending=\[False, False\], inplace=True)  
print(df\_summary.head(10))

This prints the top 10 St. Louis advisers by number of private funds in the last year, along with total gross assets of those funds. We expect known large firms to appear (e.g., **Stifel**, **Edward Jones**, etc., if they have private funds).

### 5\. **Identify the Top RIA**

From the sorted summary, the first entry (df\_summary.iloc\[0\]) will be the RIA with the most private placement activity by our metric.

We should retrieve that name and metrics:

top\_ria \= df\_summary.iloc\[0\]  
print(f"Top RIA in St. Louis by private fund count: {top\_ria\[group\_col\]}")  
print(f"Private funds count: {int(top\_ria\['num\_private\_funds'\])}, Total gross assets: {top\_ria\['total\_gross\_assets'\]}")

This will output the name of the RIA and their stats. We should double-check the result to ensure it makes sense (e.g., a well-known firm or a plausible name, and not an artifact like a data error).

**(Optional)**: It might be useful to see if the adviser’s office location is indeed St. Louis (in case the filter missed a suburb, etc.). If the top result is a surprise or not clearly St. Louis, we might need to adjust the location filter.

### 6\. **Result Interpretation and Next Steps**

Now that we have identified the top RIA, we can prepare the answer to the question. Given that the final system uses Vertex AI for generating answers, our approach will be to feed the summary or result into the model's context or knowledge base. Since Vertex AI is already configured in the repo to use these data, we mainly ensure the data is ready.

**Next Steps / Integration:** \- **Store or Pass the Result**: Ensure the result (top RIA name and metrics) is accessible to the answer generation component. This might mean saving df\_summary or the top result to a known location or format that the GenAI can draw from (for example, a CSV or a database, or directly injecting into the prompt context when answering). \- **Use Vertex AI for Q\&A**: The system likely will use the processed data to allow questions like "Which RIA in St. Louis has done the most private placements in the last year?" and the model will respond using the data. We should verify that Vertex AI’s responses are grounded in these results. \- Since this is already configured, we don't need to implement it anew; just ensure our data pipeline provides the info.

### 7\. **Ensure Up-to-date Libraries and Tools**

We will use familiar libraries (pandas for data manipulation). It's wise to ensure the environment has up-to-date versions of these packages for performance and compatibility, but since we prefer not to introduce new dependencies, we'll stick with pandas (and possibly numpy for numeric operations). If any geolocation or advanced analysis was needed, we could consider libraries like geopandas or Google Maps API, but it's not necessary here given the straightforward filtering.

**AI Assistance (Vertex AI)**: We leverage Vertex AI for the **natural language interface**. For the data analysis itself, a structured approach with pandas suffices. In the future, we could explore: \- Training a Vertex AI Tabular model or AutoML on historical data to predict trends, or \- Using Vertex AI’s embedding or Q\&A features to allow more flexible querying of ADV filings.

However, for this specific query, our manual analysis with pandas is appropriate and will feed the answer back to the Vertex-powered interface.

## Conclusion

By following this plan: \- We **confirmed** the availability of the required Schedule D 7.B(1) data in our repository. \- We **extracted and merged** the data with adviser info. \- We **filtered** for St. Louis, MO based advisers and the relevant time frame (last 12 months). \- We **aggregated** private fund counts and assets to measure "private placement activity." \- We identified the **top RIA** in St. Louis by this measure (with preliminary candidates like Stifel Financial or Edward Jones likely to emerge). \- Finally, we will integrate this result so that Vertex AI can generate a clear answer to the user's question.

This structured approach ensures the answer is grounded in the latest data and can be delivered through the existing GenAI (Vertex AI) interface in a user-friendly manner.

---

