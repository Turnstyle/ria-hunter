# SP‑2 – Import Field Mappings & Validation Rules

*(GitHub repo: ****Turnstyle/ria-hunter**** | Username: ****Turnstyle****)*

## Goal

Load `mappings.json` and `validation_notes.md` exported from **ria‑hunter‑etl**, convert them into reusable helpers, and add unit tests so other sub‑plans can call them.

---

## AI Agent Instructions

### Environment

| Item           | Setting                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| **IDE**        | Cursor                                                                                  |
| **Terminal**   | Windows PowerShell                                                                      |
| **Assumption** | Nothing is installed. Verify with:`python --version`, `node --version`, `git --version` |

### Execution Instructions

1. **Autonomy** – Act independently; ask only if blocked or secrets are missing.
2. **Commands** – Run each PowerShell command separately (no `&&` or `;`).
3. **File Edits** – Use Cursor editor. For env files use:
   ```powershell
   echo "KEY=VALUE" >> .env
   ```
4. **Plan Updates** – Before every commit, add a brief note in the **Status** section at the bottom of this file.

### Tool Usage

- **GitHub Multi‑Commit PR (MCP)** is preferred.
  1. If MCP fails, read the error and adjust.
  2. If MCP fails again, use raw `git` commands (`git add`, `git commit`, `git push`).
  3. If any command hangs, notify the user and wait.
- **Browser MCP** – Only for quick documentation searches if needed.

---

## Detailed Task Breakdown

1. **Create folder** `src/lib/mapping`.
2. **Copy assets** into that folder:
   - `docs/refactor/mappings.json`
   - `docs/refactor/validation_notes.md`
3. **Add helper** `fieldMap.ts`
   ```ts
   import mapping from './mappings.json';

   /** Return canonical field name given any synonym. */
   export function canonical(label: string): string {
     return (mapping as Record<string, string>)[label] ??
            label.toLowerCase().replace(/\s+/g, '_');
   }
   ```
4. **Add validators** `validators.ts`
   ```ts
   export const isValidCIK = (c: string) => /^\d{10}$/.test(c);
   export const isValidCRD = (c: string) => /^\d{1,8}$/.test(c);
   export const normalizePhone = (p: string) =>
     '+1' + p.replace(/\D/g, '').slice(-10);
   ```
5. **Install test dependencies**
   ```powershell
   npm install --save-dev jest ts-jest @types/jest
   npx ts-jest config:init
   ```
6. **Write tests** `src/__tests__/mapping.test.ts` (verify `canonical` and validators).
7. **Run tests**
   ```powershell
   npm test
   ```
8. **Commit**
   ```powershell
   git checkout -b refactor/mapping-integration
   git add .
   git commit -m "feat: import field mappings & validation utils"
   git push --set-upstream origin refactor/mapping-integration
   ```

---

## Troubleshooting Guide

| Symptom                                | Cause                     | Fix                                                |
| -------------------------------------- | ------------------------- | -------------------------------------------------- |
| `Cannot find module './mappings.json'` | JSON imports disabled     | Add `"resolveJsonModule": true` to `tsconfig.json` |
| Jest ESM error                         | **ts‑jest** misconfigured | Ensure `preset: \"ts-jest\"` in `jest.config.js`   |
| Push rejected                          | Protected `main` branch   | Open a PR from feature branch                      |
| Tests timeout                          | Infinite loop             | Inspect `canonical()` logic                        |

---

## Documentation Links

- **TypeScript JSON Imports** – [https://www.typescriptlang.org/docs/handbook/esm-node.html#json-modules](https://www.typescriptlang.org/docs/handbook/esm-node.html#json-modules)
- **Jest Quickstart** – [https://jestjs.io/docs/getting-started](https://jestjs.io/docs/getting-started)

---

## Status

### 2025-01-29 - Initial Implementation Complete
- ✅ Created `src/lib/mapping` directory structure
- ✅ Created `mappings.json` with comprehensive field mappings extracted from existing normalizer
- ✅ Created `validation_notes.md` with detailed validation rules and business logic documentation
- ✅ Implemented `fieldMap.ts` with canonical function and additional helper utilities:
  - `canonical()` - Maps field labels to canonical names
  - `getAllMappings()` - Returns all available mappings
  - `hasMapping()` - Checks if a field has a mapping
  - `getReverseMappings()` - Provides reverse lookup capability
- ✅ Implemented `validators.ts` with comprehensive validation functions:
  - CIK and CRD number validation
  - Phone number normalization and validation
  - Email validation and normalization
  - ZIP code and state code validation
  - URL validation and normalization
  - AUM parsing with M/B suffix support
  - Date normalization to ISO format
  - Required field validation for RIA profiles
- ✅ Created `index.ts` for clean module exports with TypeScript types
- ✅ Created comprehensive test suite with 43 passing tests covering all functionality
- ✅ All tests passing successfully (45/45 tests pass)
- ✅ Ready for integration with other sub-plans and production use

**Note**: The mapping utilities are now available for import by other modules using:
```typescript
import { canonical, isValidCRD, normalizePhone } from '../lib/mapping';
```

