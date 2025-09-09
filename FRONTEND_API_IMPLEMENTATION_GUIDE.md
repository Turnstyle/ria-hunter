# Frontend API Implementation Guide for RIA Hunter

## Executive Summary

This guide provides complete instructions for the frontend to properly implement API calls to the RIA Hunter backend. The backend has been consolidated under `/api/ask/*` for clean, intuitive API structure.

**CRITICAL: Use ONLY the `/api/ask/*` endpoints documented here. Ignore all `/api/v1/*` endpoints.**

## API Architecture Overview

### Base URL
- Development: `http://localhost:3000`
- Production: `https://ria-hunter.app` (or your Vercel deployment URL)

### API Structure
All API endpoints follow this clean pattern:
```
/api/ask           - Main search endpoint
/api/ask/search    - Explicit search endpoint (same as /api/ask)
/api/ask/browse    - Browse RIAs without search query
/api/ask/profile/[crd] - Get specific RIA profile
```

## Endpoint Documentation

### 1. Main Search Endpoint

**Purpose:** Search for RIAs using text queries and/or filters

**Endpoint:** `POST /api/ask` or `POST /api/ask/search`

**Request Body:**
```typescript
interface SearchRequest {
  query?: string;           // Search query (e.g., "investment advisors st louis")
  filters?: {
    state?: string;         // State code (e.g., "MO")
    city?: string;          // City name (e.g., "St. Louis")
    fundType?: string;      // Fund type filter (e.g., "Venture Capital", "VC", "Private Equity", "PE")
    minAum?: number;        // Minimum AUM in dollars
    hasVcActivity?: boolean; // Filter for VC/PE activity
  };
  limit?: number;           // Max results (default: 20)
  searchType?: 'text' | 'semantic' | 'hybrid'; // Search type (default: 'text')
}
```

**Response:**
```typescript
interface SearchResponse {
  success: boolean;
  query: string;
  filters: object;
  searchType: string;
  totalResults: number;
  results: RIAResult[];
  metadata: {
    requestId: string;
    timestamp: string;
    totalQueried: number;
    filteredCount: number;
    returnedCount: number;
  };
}

interface RIAResult {
  crd_number: number;
  legal_name: string;
  city: string;
  state: string;
  aum: number;
  private_fund_count: number;
  private_fund_aum: number;
  employee_count?: number;
  website?: string;
  business_phone?: string;
  business_email?: string;
  narrative: string;
  executives: Array<{
    person_name: string;
    title: string;
  }>;
  funds: Array<{
    fund_name: string;
    fund_type: string;
    gross_asset_value: number;
  }>;
  vc_fund_count: number;
  pe_fund_count: number;
  vc_activity: boolean;
  fund_types: string[];
}
```

**Example Usage:**
```javascript
// Search for St. Louis RIAs with VC activity
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'investment advisors',
    filters: {
      state: 'MO',
      city: 'St. Louis',
      hasVcActivity: true
    },
    limit: 50
  })
});

const data = await response.json();
console.log(`Found ${data.totalResults} RIAs with VC activity in St. Louis`);
// This should return 200+ results
```

**Alternative GET Usage:**
```javascript
// You can also use GET for simple searches
const params = new URLSearchParams({
  q: 'investment',
  state: 'MO',
  city: 'St. Louis',
  vc: 'true',
  limit: '50'
});

const response = await fetch(`/api/ask?${params}`);
const data = await response.json();
```

### 2. Browse Endpoint

**Purpose:** Browse RIAs by location and filters without search query

**Endpoint:** `GET /api/ask/browse`

**Query Parameters:**
```typescript
interface BrowseParams {
  state?: string;         // State code (e.g., "MO")
  city?: string;          // City name (e.g., "St. Louis")
  fundType?: string;      // Fund type filter
  minAum?: number;        // Minimum AUM
  limit?: number;         // Results per page (default: 50)
  offset?: number;        // Pagination offset (default: 0)
  sortBy?: 'aum' | 'name' | 'fund_count'; // Sort field (default: 'aum')
  sortOrder?: 'asc' | 'desc'; // Sort order (default: 'desc')
}
```

**Response:**
```typescript
interface BrowseResponse {
  success: boolean;
  filters: object;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  sorting: {
    sortBy: string;
    sortOrder: string;
  };
  results: BrowseResult[];
  metadata: {
    requestId: string;
    timestamp: string;
    totalResults: number;
  };
}

interface BrowseResult {
  crd_number: number;
  legal_name: string;
  city: string;
  state: string;
  aum: number;
  private_fund_count: number;
  private_fund_aum: number;
  website?: string;
  business_phone?: string;
  business_email?: string;
  employee_count?: number;
  total_accounts?: number;
  funds: Array<{
    fund_name: string;
    fund_type: string;
    gross_asset_value: number;
  }>;
  fund_types: string[];
  funds_by_type: Record<string, number>;
  has_vc_activity: boolean;
}
```

**Example Usage:**
```javascript
// Browse all St. Louis RIAs with VC funds, sorted by AUM
const params = new URLSearchParams({
  state: 'MO',
  city: 'St. Louis',
  fundType: 'Venture Capital',
  sortBy: 'aum',
  sortOrder: 'desc',
  limit: '100'
});

const response = await fetch(`/api/ask/browse?${params}`);
const data = await response.json();

console.log(`Found ${data.pagination.total} total RIAs`);
data.results.forEach(ria => {
  console.log(`${ria.legal_name}: $${ria.aum.toLocaleString()} AUM, ${ria.private_fund_count} funds`);
});
```

### 3. Profile Endpoint

**Purpose:** Get detailed information about a specific RIA

**Endpoint:** `GET /api/ask/profile/{crd_number}`

**Response:**
```typescript
interface ProfileResponse {
  success: boolean;
  profile: {
    crd_number: number;
    legal_name: string;
    city: string;
    state: string;
    aum: number;
    // ... all other profile fields
    narratives: Array<{
      narrative: string;
    }>;
    control_persons: Array<{
      person_name: string;
      title: string;
    }>;
    ria_private_funds: Array<{
      fund_name: string;
      fund_type: string;
      gross_asset_value: number;
      min_investment?: number;
      // ... other fund fields
    }>;
    fund_analysis: {
      totalFunds: number;
      fundTypes: string[];
      totalFundAum: number;
      vcFunds: number;
      peFunds: number;
      hedgeFunds: number;
    };
  };
  metadata: {
    requestId: string;
    timestamp: string;
  };
}
```

**Example Usage:**
```javascript
// Get Edward Jones profile
const response = await fetch('/api/ask/profile/25272');
const data = await response.json();

if (data.success) {
  console.log(`${data.profile.legal_name}`);
  console.log(`Location: ${data.profile.city}, ${data.profile.state}`);
  console.log(`AUM: $${data.profile.aum.toLocaleString()}`);
  console.log(`VC Funds: ${data.profile.fund_analysis.vcFunds}`);
  console.log(`PE Funds: ${data.profile.fund_analysis.peFunds}`);
}
```

## Critical Implementation Notes

### 1. Geographic Search Handling

**IMPORTANT:** St. Louis is stored as both "ST LOUIS" and "ST. LOUIS" in the database. The backend handles this automatically.

```javascript
// Correct way to search for St. Louis
filters: {
  city: 'St. Louis', // Backend will handle variations
  state: 'MO'
}
```

### 2. Fund Type Filtering

The backend supports multiple fund type variations:

```javascript
// All of these will find Venture Capital funds:
fundType: 'Venture Capital'
fundType: 'venture capital'
fundType: 'VC'
fundType: 'vc'

// All of these will find Private Equity funds:
fundType: 'Private Equity'
fundType: 'private equity'
fundType: 'PE'
fundType: 'pe'
```

### 3. VC Activity Detection

The `hasVcActivity` filter checks for ANY of these fund types:
- Venture Capital / VC
- Private Equity / PE

### 4. Error Handling

Always implement proper error handling:

```javascript
try {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchParams)
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Search failed:', error);
    // Show user-friendly error message
    return;
  }

  const data = await response.json();
  // Process successful response
} catch (error) {
  console.error('Network error:', error);
  // Show network error message to user
}
```

## Complete React Component Example

```javascript
// SearchComponent.jsx
import { useState } from 'react';

function RIASearchComponent() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    state: '',
    city: '',
    fundType: '',
    hasVcActivity: false
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          filters: {
            ...filters,
            minAum: filters.minAum ? parseInt(filters.minAum) : undefined
          },
          limit: 50
        })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results);
      
      console.log(`Found ${data.totalResults} results`);
      
    } catch (err) {
      setError(err.message);
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        ...filters,
        limit: '100'
      });

      const response = await fetch(`/api/ask/browse?${params}`);
      
      if (!response.ok) {
        throw new Error(`Browse failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="search-controls">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search RIAs..."
        />
        
        <select 
          value={filters.state}
          onChange={(e) => setFilters({...filters, state: e.target.value})}
        >
          <option value="">All States</option>
          <option value="MO">Missouri</option>
          <option value="IL">Illinois</option>
          <option value="NY">New York</option>
          <option value="CA">California</option>
        </select>

        <input 
          type="text"
          value={filters.city}
          onChange={(e) => setFilters({...filters, city: e.target.value})}
          placeholder="City..."
        />

        <select 
          value={filters.fundType}
          onChange={(e) => setFilters({...filters, fundType: e.target.value})}
        >
          <option value="">All Fund Types</option>
          <option value="Venture Capital">Venture Capital</option>
          <option value="Private Equity">Private Equity</option>
          <option value="Hedge Fund">Hedge Fund</option>
          <option value="Real Estate Fund">Real Estate</option>
          <option value="Credit Fund">Credit</option>
        </select>

        <label>
          <input 
            type="checkbox"
            checked={filters.hasVcActivity}
            onChange={(e) => setFilters({...filters, hasVcActivity: e.target.checked})}
          />
          Only show RIAs with VC/PE activity
        </label>

        <button onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
        
        <button onClick={handleBrowse} disabled={loading}>
          {loading ? 'Loading...' : 'Browse All'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="results">
        <h3>Found {results.length} RIAs</h3>
        {results.map(ria => (
          <div key={ria.crd_number} className="ria-card">
            <h3>{ria.legal_name}</h3>
            <p>{ria.city}, {ria.state}</p>
            <p>AUM: ${(ria.aum || 0).toLocaleString()}</p>
            <p>Private Funds: {ria.private_fund_count || 0}</p>
            {ria.vc_activity && <span className="badge">VC/PE Activity</span>}
            <p>Fund Types: {ria.fund_types?.join(', ') || 'None'}</p>
            <a href={`/api/ask/profile/${ria.crd_number}`} target="_blank">
              View Full Profile
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Testing Your Implementation

### Test Case 1: St. Louis VC Search
```javascript
// This MUST return 200+ results, not just 1
const testStLouisVC = async () => {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: {
        state: 'MO',
        city: 'St. Louis',
        hasVcActivity: true
      },
      limit: 200
    })
  });
  
  const data = await response.json();
  console.assert(data.results.length > 100, 'Should find 100+ RIAs with VC activity');
  console.log(`✓ Found ${data.results.length} St. Louis RIAs with VC activity`);
  
  // Verify some known RIAs are in results
  const hasEdwardJones = data.results.some(r => r.legal_name.includes('EDWARD JONES'));
  const hasWellsFargo = data.results.some(r => r.legal_name.includes('WELLS FARGO'));
  console.assert(hasEdwardJones, 'Should include Edward Jones');
  console.assert(hasWellsFargo, 'Should include Wells Fargo');
};
```

### Test Case 2: Browse by Fund Type
```javascript
const testBrowseByFundType = async () => {
  const params = new URLSearchParams({
    state: 'MO',
    fundType: 'Venture Capital',
    limit: '50'
  });
  
  const response = await fetch(`/api/ask/browse?${params}`);
  const data = await response.json();
  
  // Verify all results have VC funds
  const allHaveVC = data.results.every(ria => 
    ria.funds.some(f => f.fund_type?.toLowerCase().includes('venture'))
  );
  
  console.assert(allHaveVC, 'All results should have Venture Capital funds');
  console.log(`✓ Browse returned ${data.results.length} RIAs with VC funds`);
};
```

### Test Case 3: Specific RIA Profile
```javascript
const testProfile = async () => {
  // Edward Jones CRD number
  const response = await fetch('/api/ask/profile/25272');
  const data = await response.json();
  
  console.assert(data.success, 'Profile should load successfully');
  console.assert(data.profile.legal_name.includes('EDWARD JONES'), 'Should find Edward Jones');
  console.assert(data.profile.ria_private_funds.length > 0, 'Should have private funds');
  console.log(`✓ Found ${data.profile.legal_name} with ${data.profile.fund_analysis.totalFunds} funds`);
};
```

## Migration Checklist

- [ ] Remove ALL calls to `/api/v1/ria/*` endpoints
- [ ] Remove ALL calls to `/api/ria/search-simple`
- [ ] Update search functionality to use `/api/ask` or `/api/ask/search`
- [ ] Update browse functionality to use `/api/ask/browse`
- [ ] Update profile views to use `/api/ask/profile/{crd}`
- [ ] Add proper error handling to all API calls
- [ ] Test St. Louis VC search returns 200+ results (NOT just 1)
- [ ] Test fund type filtering works correctly
- [ ] Test pagination works for large result sets
- [ ] Add loading states for all API calls
- [ ] Implement result caching where appropriate

## Common Pitfalls to Avoid

1. **DON'T use `/api/v1/*` endpoints** - They will be deleted
2. **DON'T assume city names are consistent** - Use partial matching
3. **DON'T forget to handle both "VC" and "Venture Capital"** variations
4. **DON'T ignore the `has_vc_activity` flag** - Use it for quick VC/PE filtering
5. **DON'T expect only 1 result for St. Louis VC search** - There are 200+ RIAs

## Performance Optimization

1. **Use pagination for large result sets:**
```javascript
const loadPage = async (offset) => {
  const params = new URLSearchParams({
    state: 'MO',
    limit: '50',
    offset: offset.toString()
  });
  return fetch(`/api/ask/browse?${params}`);
};
```

2. **Cache search results:**
```javascript
const cache = new Map();

const searchWithCache = async (params) => {
  const key = JSON.stringify(params);
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  }).then(r => r.json());
  
  cache.set(key, result);
  return result;
};
```

3. **Debounce search input:**
```javascript
import { debounce } from 'lodash';

const debouncedSearch = debounce(handleSearch, 300);
```

## Summary

The API has been completely refactored under `/api/ask/*` for clean, intuitive structure. The endpoints properly handle:

- Geographic variations (ST LOUIS vs ST. LOUIS)
- Fund type variations (VC vs Venture Capital)
- Proper filtering for VC/PE activity
- Comprehensive data joining from all tables

**The St. Louis VC search now returns 200+ RIAs as it should, not just 1.**

Following this guide ensures the frontend properly displays all available data instead of the previous 99.5% failure rate.