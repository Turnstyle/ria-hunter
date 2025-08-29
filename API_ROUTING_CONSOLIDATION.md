# 🚨 API Routing Consolidation - Important Notice

**Date:** December 2024  
**Status:** COMPLETED ✅

## DEPRECATED: `/_backend/api/*` paths

**⚠️ WARNING**: The `/_backend/api/*` path structure has been **DEPRECATED** and **REMOVED** as of December 2024.

### What Changed

Previously, this project had a confusing dual API structure:
- ❌ `/_backend/api/*` (DEPRECATED - NO LONGER EXISTS)
- ✅ `/api/*` (STANDARD - CURRENT)

This caused unnecessary complexity, routing issues, and confusion for developers.

### Current API Structure

**All API endpoints now use standard Next.js routing:**

```
✅ CORRECT PATHS (use these):
- /api/ask
- /api/ask-stream  
- /api/balance
- /api/credits/balance
- /api/stripe-webhook
- /api/v1/ria/*
- /api/admin/*
- /api/debug/*
```

```
❌ DEPRECATED PATHS (DO NOT USE):
- /_backend/api/ask          → Use /api/ask
- /_backend/api/balance      → Use /api/balance  
- /_backend/api/stripe-webhook → Use /api/stripe-webhook
- Any other /_backend/api/* paths
```

### For Developers/AI Agents

**If you see references to `/_backend/api/*` in old documentation:**
1. These paths are **DEPRECATED** and will not work
2. Replace them with the corresponding `/api/*` path
3. All functionality has been consolidated into standard `/api/*` routes

### For Frontend Integration

Update your API calls to use standard paths:

```javascript
// ❌ OLD (will not work):
const response = await fetch('https://ria-hunter.app/_backend/api/ask', { ... });

// ✅ NEW (correct):
const response = await fetch('https://ria-hunter.app/api/ask', { ... });
```

### Documentation Status

The following documentation files contain **historical references** to the deprecated paths:
- `Docs/claude_q&a_v2_27-Aug.md`
- `Docs/master_claude_fix_plan_backend_26-Aug-2026.md`
- `Docs/backend_tasks_from_claude_26-Aug-2025.md`

These files are kept for historical context but **DO NOT represent current API structure**.

---

## Summary

✅ **Use `/api/*` for all API endpoints**  
❌ **DO NOT use `/_backend/api/*` - these paths no longer exist**

For current API documentation, see: `BACKEND_API_DOCUMENTATION.md`
