import fs from 'fs';
import path from 'path';

export interface ProjectContext {
  gcpProjectId: string | null;
  supabaseProjectId: string | null;
  githubRepository?: string | null;
  vercelProjectId?: string | null;
}

let cachedContext: ProjectContext | null = null;

function readGcpProjectId(): string | null {
  const envProject = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (envProject) {
    return envProject;
  }

  const keyPath = process.env.GCP_KEY_PATH || path.resolve(process.cwd(), 'gcp-key.json');
  try {
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.project_id && typeof parsed.project_id === 'string') {
        return parsed.project_id;
      }
    }
  } catch (error) {
    console.warn('Unable to read GCP project id from key file:', error);
  }

  return null;
}

function extractSupabaseProjectId(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

function readGithubRepository(): string | null {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  const owner = process.env.VERCEL_GIT_REPO_OWNER || process.env.GITHUB_ORG;
  const repo = process.env.VERCEL_GIT_REPO_SLUG || process.env.GITHUB_REPO;

  if (owner && repo) {
    return `${owner}/${repo}`;
  }

  return null;
}

function readVercelProjectId(): string | null {
  return (
    process.env.VERCEL_PROJECT_ID ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    null
  );
}

export function validateProjectContext(forceRevalidation = false): ProjectContext {
  if (cachedContext && !forceRevalidation) {
    return cachedContext;
  }

  const gcpProjectId = readGcpProjectId();
  const supabaseProjectId = extractSupabaseProjectId(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  );
  const githubRepository = readGithubRepository();
  const vercelProjectId = readVercelProjectId();

  if (!gcpProjectId) {
    throw new Error('Missing Google Cloud project ID. Set GOOGLE_PROJECT_ID or provide gcp-key.json.');
  }

  if (!supabaseProjectId) {
    throw new Error(
      'Missing Supabase project ID. Ensure NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is configured.'
    );
  }

  const context: ProjectContext = {
    gcpProjectId,
    supabaseProjectId,
    githubRepository,
    vercelProjectId,
  };

  cachedContext = context;

  console.log('✓ Project Context:', context);
  return context;
}
