import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Admin client using service role key for server-side operations. This bypasses
// RLS and should only be used in secure server contexts. During automated tests
// we may not have real credentials; instead of throwing at import time we fall
// back to a stub that raises a helpful error when anything tries to use it.
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function createSupabaseStub(message: string): SupabaseClient<any, any, any> {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Ensure the proxy is not treated like a promise by Jest or Next.js
        return undefined
      }

      // Support chained property access (e.g. supabaseAdmin.auth.getUser)
      return new Proxy(() => {
        throw new Error(message)
      }, handler)
    },
    apply() {
      throw new Error(message)
    }
  }

  return new Proxy(() => {}, handler) as SupabaseClient<any, any, any>
}

const missingConfig = !supabaseUrl || !supabaseServiceRoleKey
const warningMessage = 'Supabase admin client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'

if (missingConfig && process.env.NODE_ENV !== 'test') {
  console.warn(warningMessage)
}

const supabaseAdminClient = missingConfig
  ? createSupabaseStub(warningMessage)
  : createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

export const supabaseAdmin = supabaseAdminClient
export const supabaseAdminConfigured = !missingConfig
