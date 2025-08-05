# AppFoundation Integration Notes for ria-hunter-etl

*Last Updated: May 26, 2024*

## Introduction

This document outlines key information about the `AppFoundation` Nx monorepo, specifically focusing on aspects relevant to the `ria-hunter-etl` backend project. The `ria-hunter-etl` project is responsible for extracting, transforming, and loading data into a Supabase database that will be consumed by the `ria-hunter` frontend application residing within `AppFoundation`.

## `ria-hunter` Frontend Application (`AppFoundation/apps/riahunter`)

The frontend for the RIA Hunter project is a Next.js application located at `apps/riahunter` within the `AppFoundation` monorepo.

*   **Location:** `AppFoundation/apps/riahunter/`
*   **Nx Project Configuration:** Managed by `AppFoundation/apps/riahunter/project.json`.
*   **Vercel Deployment:** Configuration for deployment to Vercel is present in `AppFoundation/apps/riahunter/vercel.json`. The typical build command is `npx nx build riahunter --prod` with output to `dist/apps/riahunter/.next`.

## Relevant Shared Libraries in `AppFoundation`

`AppFoundation` utilizes several shared libraries. Those most pertinent to the `ria-hunter-etl` project are:

### 1. `libs/schemas`
*   **Purpose:** Contains shared data schemas, likely Zod schemas, for data validation and defining data structures across the monorepo.
*   **Import Path (within AppFoundation):** `@appfoundation/schemas`
*   **Key File for ETL:** `AppFoundation/libs/schemas/src/lib/riahunter.schemas.ts`. The ETL process should ensure that the data it loads into Supabase aligns with the schemas defined here, particularly if the frontend relies on these specific structures.
*   **Location:** `AppFoundation/libs/schemas/`

### 2. `libs/supabase`
*   **Purpose:** Provides Supabase client instances and related utilities for frontend applications within `AppFoundation`.
*   **Import Path (within AppFoundation):** `supabase` (e.g., `import { supabase } from 'supabase';`)
*   **Location:** `AppFoundation/libs/supabase/`
*   **Note for ETL:** The `ria-hunter-etl` project will connect to Supabase directly using Python, typically with `SUPABASE_URL` and a `SUPABASE_SERVICE_ROLE_KEY`. While the frontend uses `libs/supabase` for its client (often with an `ANON_KEY`), the ETL should be aware that the ultimate data destination is the same Supabase instance.

### 3. Other Libraries
*   `libs/auth`: Handles authentication (Auth0) for the frontend. Not directly used by ETL but good for context.
*   `libs/ai-services`: For integrating AI services (e.g., Google Gemini) on the frontend. ETL might populate data that this library uses (e.g., narrative text for embeddings).

**Note:** These libraries generally do not have their own `package.json` files; their dependencies are managed at the `AppFoundation` workspace root, and their build configurations are in their respective `project.json` files.

## Environment Variables in `AppFoundation`

*   Frontend applications in `AppFoundation` (like `ria-hunter`) typically use a root `.env.local` file for local development.
*   Variables prefixed with `NEXT_PUBLIC_` are exposed to the client-side.
*   Key Supabase-related variables for the frontend are typically `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
*   The `ria-hunter-etl` project will require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for its operations, which should be managed in its own `.env` file (e.g., `ria-hunter-etl/.env`).

## UI Components

*   There is no dedicated, workspace-wide shared UI library (e.g., `libs/ui-shared`) currently.
*   UI components found within `AppFoundation/apps/AppFoundation/src/components/ui/` are local to the `AppFoundation` application itself.
*   This is not directly relevant to the ETL project but clarifies the structure.

## Key Configuration Files in `AppFoundation` Monorepo

*   **`nx.json` (Root):** Defines Nx workspace-level configurations, plugins, and default generator settings.
*   **`tsconfig.base.json` (Root):** Configures TypeScript path aliases used for importing shared libraries (e.g., `@appfoundation/schemas`, `auth`, `supabase`).
*   **`project.json` (Per App/Lib):** Located in the root of each application and library (e.g., `AppFoundation/apps/riahunter/project.json`, `AppFoundation/libs/schemas/project.json`). Defines targets for building, serving, testing, linting, etc.

## Tooling in `AppFoundation`

*   **ESLint:** Used for linting. Configuration is typically in a root `.eslintrc.js`.
*   **Prettier:** Used for code formatting. Configuration is in a root `.prettierrc`.
*   While the `ria-hunter-etl` project is Python-based, awareness of these tools is useful if contributing to or referencing shared TypeScript/JavaScript files (e.g., schemas).

This information should aid in understanding how the `ria-hunter-etl` project interacts with and supports the `ria-hunter` frontend application within the `AppFoundation` ecosystem. 