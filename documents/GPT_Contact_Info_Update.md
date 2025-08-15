# Plan: Adding Contact Info and Executives to RIA Profiles

## Backend – Data Enrichment and API Updates

1. **Extend Database Schema:** Add new columns for contact info in the ria\_profiles table – specifically phone (and optionally fax and website if not already added)[\[1\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/documents/data_redo/04_b_supabase_seed.md#L36-L43). These will store each RIA’s main phone number and website URL for quick access. Also verify the existence of a control\_persons table (for executives/owners); create it if missing, with fields like RIA identifier (CRD or CIK), person name, and role/title.

2. **Parse Source Data for Contact Info:** Update the ETL pipeline or mapping logic to capture phone numbers and websites from the SEC Form ADV data:

3. If the SEC’s bulk data CSV already contains phone and website fields, map those to our schema and include them in ria\_profiles.csv. (For example, the Document AI normalizer already defines mappings for “Phone” and “Website” to our phone and website fields[\[2\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts#L35-L42), but these values were not present in the initial data load.)

4. If the bulk data is split across tables, identify where contact info resides. The Form ADV Part 1 data (e.g. the **Investment\_Adviser\_Firm\_Filing** dataset) likely includes main office telephone number and website. Adjust our extraction script to pull those fields. This may involve joining multiple CSV tables if needed (per SEC’s guidance that multiple tables must be linked for complete data[\[3\]](https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data#:~:text=registered%20investment%20advisers%20and%20for,pdf%20format)[\[4\]](https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data#:~:text=Form%20ADV%20Part%201%20Data,Files)).

5. If the bulk data doesn’t directly provide websites, consider using the SEC’s IAPD **“Investment Adviser Data”** download or Form ADV mapping files to get website URLs. As a fallback, the **Document AI** approach can extract “Website” fields from the latest Form ADV PDFs if needed (our normalizer is already prepared to handle fields labeled *Website/Web Address*[\[2\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts#L35-L42)).

6. **Backfill Phone & Website:** Re-run the data transform with the new mappings to produce an updated ria\_profiles.csv including phone and website columns for each RIA. Load this into Supabase, updating each row’s phone and website. Verify that a significant number of RIA records now have these fields populated (expect many larger firms to have a business phone and possibly a website listed – e.g. Form ADV Item 1 includes phone number and any public website[\[5\]](https://www.kitces.com/blog/form-adv-part-1-rias-mistakes-best-practices/#:~:text=Form%20ADV%20Part%201%3A%20Common,address%2C%20phone%20number%2C%20websites%2C)). Currently, these are null for all profiles in our database[\[6\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L91-L99), so the backfill should change that to real values for most firms.

7. **Ingest Executive/Owner Data:** Gather the “Direct Owners and Executive Officers” (Form ADV Schedule A) data:

8. Determine if the SEC bulk data provides a table for direct owners/executives. (Often, there is a separate CSV for Schedule A information linked by an adviser’s ID.) If available, extract each person’s name (and title or ownership role if given) and load them into the control\_persons table with a reference to the adviser’s CRD/CIK.

9. If bulk data does not include this, consider alternative sources. One approach is using the FINRA/IAPD API or site: for each RIA, query the IAPD for its executive officers and owners. This could be done via a script since the IAPD site lists those individuals for each firm. However, bulk querying \~40k firms might be impractical, so prioritize at least the top firms for now if needed.

10. Populate public.control\_persons with the retrieved executive names (and any available details like position or ownership percentage). After this step, each RIA should have associated entries in control\_persons if they reported any executives/owners on Form ADV. (Our earlier analysis showed zero entries for all 10 sample RIAs[\[7\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L10-L18)[\[8\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L27-L35), confirming this data wasn’t loaded yet.)

11. **Augment Profile API:** Update the /api/v1/ria/profile/\[cik\] endpoint to include the new fields and data:

12. Ensure the Supabase query for ria\_profiles selects the new phone and website columns. The API response is already structured to return phone\_number: profile.phone and website: profile.website[\[9\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L91-L99) – after backfilling, these will be non-empty for many records.

13. Join or query the control\_persons table for the given RIA’s executives. For example, perform an additional Supabase query .from('control\_persons').select('\*').eq('crd\_number', cik) to retrieve all executives for that RIA. Attach this list to the API result JSON (e.g. as an array executives: \[...\]). Each item could include the person’s name and title if available. If only names are stored, an array of names is fine for now.

14. Double-check that the API’s JSON output keys match what the frontend expects. We will likely use executives as the key in the JSON. (The frontend isn’t yet using this field, so we’ll coordinate with the UI changes below.)

15. **Testing – Backend:** Deploy these changes to a staging environment and test with a known RIA to ensure data flows through:

16. Pick a firm that should have a phone and website (for example, BlackRock or Vanguard). Query the profile API (/api/v1/ria/profile/\[cik\]) for that firm and confirm that phone\_number and website fields are present and populated in the JSON.

17. Also verify the executives data comes through. For a firm like BlackRock, the response should now include an executives array with names of key people (e.g. Larry Fink, etc., if listed on the ADV). If no executives appear for well-known firms, investigate whether the data source is incomplete or if the query needs adjustment (e.g., using SEC file number vs. CRD for linkage).

18. Ensure no performance issues on the profile endpoint when including these joins. If the control\_persons table is large, consider adding an index on the foreign key (CRD) for faster lookup.

**Sources:**

* RIA Hunter initial database schema (missing phone/website fields)[\[1\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/documents/data_redo/04_b_supabase_seed.md#L36-L43)

* Normalizer mappings for Phone/Website fields[\[2\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts#L35-L42)

* Backend profile API output structure (prepared to include phone\_number and website)[\[9\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L91-L99)

* Frontend profile page showing Contact info section for phone/fax/website[\[11\]](https://github.com/Turnstyle/ria-hunter-app/blob/e842b142af8b7b4ed1d7e8638e18e8c51e6078fe/app/profile/%5Bcik%5D/page.tsx#L328-L336)

* SEC Form ADV data reference (Item 1 includes phone number and websites)[\[5\]](https://www.kitces.com/blog/form-adv-part-1-rias-mistakes-best-practices/#:~:text=Form%20ADV%20Part%201%3A%20Common,address%2C%20phone%20number%2C%20websites%2C)

---

[\[1\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/documents/data_redo/04_b_supabase_seed.md#L36-L43) 04\_b\_supabase\_seed.md

[https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/documents/data\_redo/04\_b\_supabase\_seed.md](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/documents/data_redo/04_b_supabase_seed.md)

[\[2\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts#L35-L42) [\[12\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts#L137-L145) [\[14\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts#L145-L152) normalizer.ts

[https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/src/docai/normalizer.ts)

[\[3\]](https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data#:~:text=registered%20investment%20advisers%20and%20for,pdf%20format) [\[4\]](https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data#:~:text=Form%20ADV%20Part%201%20Data,Files) SEC.gov | Form ADV Data

[https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data](https://www.sec.gov/foia-services/frequently-requested-documents/form-adv-data)

[\[5\]](https://www.kitces.com/blog/form-adv-part-1-rias-mistakes-best-practices/#:~:text=Form%20ADV%20Part%201%3A%20Common,address%2C%20phone%20number%2C%20websites%2C) Form ADV Part 1: Common Missteps And Best Practices For RIAs

[https://www.kitces.com/blog/form-adv-part-1-rias-mistakes-best-practices/](https://www.kitces.com/blog/form-adv-part-1-rias-mistakes-best-practices/)

[\[6\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L91-L99) [\[7\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L10-L18) [\[8\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L27-L35) [\[9\]](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts#L91-L99) route.ts

[https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/\[cik\]/route.ts](https://github.com/Turnstyle/ria-hunter/blob/d0050a85768df0ba31b0e641ed04fce81a467790/app/api/v1/ria/profile/%5Bcik%5D/route.ts)

[\[10\]](https://github.com/Turnstyle/ria-hunter-app/blob/e842b142af8b7b4ed1d7e8638e18e8c51e6078fe/app/profile/%5Bcik%5D/page.tsx#L85-L101) [\[11\]](https://github.com/Turnstyle/ria-hunter-app/blob/e842b142af8b7b4ed1d7e8638e18e8c51e6078fe/app/profile/%5Bcik%5D/page.tsx#L328-L336) [\[13\]](https://github.com/Turnstyle/ria-hunter-app/blob/e842b142af8b7b4ed1d7e8638e18e8c51e6078fe/app/profile/%5Bcik%5D/page.tsx#L330-L338) page.tsx

[https://github.com/Turnstyle/ria-hunter-app/blob/e842b142af8b7b4ed1d7e8638e18e8c51e6078fe/app/profile/\[cik\]/page.tsx](https://github.com/Turnstyle/ria-hunter-app/blob/e842b142af8b7b4ed1d7e8638e18e8c51e6078fe/app/profile/%5Bcik%5D/page.tsx)