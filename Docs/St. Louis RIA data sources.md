# St. Louis RIA Data Sources

This document details the process of identifying and verifying the assets under management (AUM) for Edward Jones and Stifel Nicolaus in St. Louis, using data available within this project.

## Summary of Findings

- **Edward Jones** and **Stifel Nicolaus** are both confirmed to have assets under management in the billions.
- The primary data source is the `ria_profiles` table in the Supabase database.
- The city for these firms is inconsistently formatted as either "ST LOUIS" or "ST. LOUIS", which was a key challenge in retrieving the data.

## Data Location and Access

The data was found in the `ria_profiles` table in the project's Supabase database. The successful query to retrieve this information is detailed below.

### Supabase Query

The following query, executed from the `find_st_louis_rias.js` script, successfully retrieved the data:

```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findRIAs() {
  try {
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('legal_name, aum, city, state')
      .or('legal_name.ilike.%EDWARD JONES%,legal_name.ilike.%STIFEL%');

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }

    console.log('Found RIAs:', data);
  } catch (error) {
    console.error('An unexpected error occurred:', error);
  }
}

findRIAs();
```

### Traceability

The script used to query the database can be found at: `find_st_louis_rias.js`.

The schema for the `ria_profiles` table was identified by running the `check_ria_profiles_schema.js` script. The relevant columns are:
- `legal_name` (TEXT)
- `aum` (NUMERIC)
- `city` (TEXT)
- `state` (TEXT)
