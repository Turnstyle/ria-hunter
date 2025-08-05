import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// TypeScript interfaces for database tables
export interface WaitlistEntry {
  id: string
  email: string
  first_name: string
  last_name: string
  company?: string
  role?: string
  created_at: string
}

export interface ContactSubmission {
  id: string
  name: string
  email: string
  subject: string
  message: string
  created_at: string
}

export interface RIAProfile {
  id: string
  firm_name: string
  legal_name: string
  crd_number: string
  sec_number?: string
  address: string
  city: string
  state: string
  zip_code: string
  phone?: string
  website?: string
  aum?: number
  employee_count?: number
  private_fund_count?: number
  private_fund_aum?: number
  last_private_fund_analysis?: string
  form_adv_date?: string
  created_at: string
  updated_at: string
}

export interface SearchLog {
  id: string
  query: string
  filters?: any
  results_count: number
  user_session?: string
  created_at: string
} 