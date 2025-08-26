# 🔧 RIA HUNTER MASTER FIX PLAN

**Date:** December 2024  
Built by Claude

---

# 🔴 BACKEND AGENT TASKS (ria-hunter repo)

**Priority: CRITICAL \- Must complete first**

## Task 1: Add Rewrite Rules to Fix Routing (HIGHEST PRIORITY)

**File:** `next.config.mjs`

Add this rewrites section to your next.config:

const nextConfig \= {

  async rewrites() {

    return \[

      // Critical mappings to fix frontend/backend mismatch

      {

        source: '/api/credits/balance',

        destination: '/\_backend/api/balance'

      },

      {

        source: '/api/balance',  

        destination: '/\_backend/api/balance'

      },

      {

        source: '/api/ask-stream',

        destination: '/\_backend/api/ask-stream'

      },

      {

        source: '/api/ask',

        destination: '/\_backend/api/ask'

      }

    \]

  },

  // ... rest of your config

}

## Task 2: Update Middleware Skip Paths

**File:** `middleware.ts`

Update the `skipAuthPaths` array to include:

const skipAuthPaths \= \[

  '/api/stripe-webhook',

  '/api/test-env',

  '/api/ria-hunter-waitlist',

  '/api/save-form-data',

  '/api/v1/ria/',

  '/api/ria/',

  '/api/ask',

  '/api/ask-stream',

  '/api/balance',

  '/api/credits/balance',  // Add this

  '/api/\_backend/api/balance',  // Add this

  '/api/\_backend/api/credits/balance',  // Add this

  '/api/debug/'

\]

## Task 3: Remove or Fix Broken Legacy Routes

**Files to check:**

- `/app/api/balance/route.ts` (if exists \- DELETE or fix the 500 error)  
- `/app/api/credits/balance/route.ts` (if exists \- DELETE or fix the 500 error)

These are causing 500 errors. Either:

1. DELETE them (recommended) since `/_backend/api/balance` works perfectly  
2. OR fix them to re-export from the working `/_backend` versions

## Task 4: Deploy and Test

1. Commit all changes  
2. Push to GitHub  
3. Wait for Vercel deployment  
4. Test these endpoints:  
   - `curl https://ria-hunter.app/api/balance` → Should return `{"balance":15}`  
   - `curl https://ria-hunter.app/api/credits/balance` → Should return `{"credits":15,"isSubscriber":false}`  
   - `curl -X POST https://ria-hunter.app/api/ask-stream -H "Content-Type: application/json" -d '{"query":"test"}'` → Should stream response

## 🚨 HUMAN INTERVENTION POINT 🚨

IF THE ABOVE TESTS FAIL:

1\. Check Vercel deployment logs

2\. May need to clear Vercel cache

3\. May need to redeploy manually

---

---

# 📋 VERIFICATION CHECKLIST

## Backend Agent Must Verify:

- [ ] Rewrites added to next.config.mjs  
- [ ] Middleware skipAuthPaths updated  
- [ ] Legacy broken routes removed or fixed  
- [ ] Deployed to Vercel  
- [ ] All test curls return 200 status

---

# ⚠️ DO NOT DO THESE THINGS

## Backend Agent:

- DO NOT change the working `/_backend/api/*` routes  
- DO NOT modify database schema  
- DO NOT change cookie configuration  
- DO NOT edit .env\* files

---

# 📊 BACKEND AGENT EXECUTION REPORT

**Execution Date:** December 2024  
**Agent:** Backend Claude AI Agent

## ✅ COMPLETED TASKS

### Task 1: Add Rewrite Rules ✅
- **Status:** COMPLETED
- **File Modified:** `next.config.mjs`
- **Changes:** Added rewrites for `/api/credits/balance` and `/api/balance` to point to `/_backend/api/balance`
- **Note:** Did not add rewrites for ask/ask-stream as they already exist in app/api (not in _backend)

### Task 2: Update Middleware Skip Paths ✅
- **Status:** ALREADY CORRECT
- **File Checked:** `middleware.ts`
- **Result:** All required skip paths were already present in the middleware configuration

### Task 3: Remove Broken Legacy Routes ✅
- **Status:** COMPLETED
- **Actions Taken:**
  - Deleted `app/api/balance/route.ts` - This was the problematic legacy route with complex implementation
  - Kept `app/api/credits/balance/route.ts` - This correctly re-exports from _backend
  - Verified `app/_backend/api/balance/route.ts` is the working implementation

### Task 4: Deploy and Test 🔄
- **Status:** IN PROGRESS
- **Next Steps:** 
  - Committing changes to Git
  - Pushing to GitHub
  - Deploying via Vercel CLI
  - Testing endpoints

## 📝 SUMMARY

All backend routing fixes have been implemented:
1. ✅ Rewrite rules added to redirect frontend calls to backend routes
2. ✅ Middleware authentication bypass paths already configured correctly  
3. ✅ Removed conflicting legacy balance route that was causing 500 errors
4. 🔄 Deployment in progress

