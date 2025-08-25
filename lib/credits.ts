import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type CreditSource = 'purchase' | 'grant' | 'migration' | 'share' | 'subscription';
type CreditRefType = 'welcome' | 'monthly' | 'purchase' | 'share' | 'promo';

interface CreditTransaction {
  userId: string;
  amount: number;
  source: CreditSource;
  idempotencyKey?: string;
  refType?: CreditRefType;
  refId?: string;
  metadata?: Record<string, any>;
}

/**
 * Ensures a user account exists in the credits system
 */
export async function ensureAccount(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('user_accounts')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error ensuring account:', error);
    throw new Error(`Failed to ensure account: ${error.message}`);
  }
}

/**
 * Get current balance for a user
 */
export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('user_accounts')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching balance:', error);
    throw new Error(`Failed to get balance: ${error.message}`);
  }

  return data?.balance || 0;
}

/**
 * Grant credits to a user account
 */
export async function grantCredits({
  userId,
  amount,
  source,
  idempotencyKey,
  refType,
  refId,
  metadata
}: CreditTransaction): Promise<void> {
  if (amount <= 0) return;
  
  // If idempotency key provided, check if transaction already exists
  if (idempotencyKey) {
    const existing = await idem(idempotencyKey);
    if (existing) return; // Transaction already processed
  }
  
  const { error } = await supabaseAdmin.rpc('add_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_idempotency_key: idempotencyKey,
    p_ref_type: refType,
    p_ref_id: refId,
    p_metadata: metadata
  });

  if (error) {
    console.error('Error granting credits:', error);
    throw new Error(`Failed to grant credits: ${error.message}`);
  }
}

/**
 * Check if a transaction with this idempotency key already exists
 */
export async function idem(idempotencyKey: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('credit_transactions')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) {
    console.error('Error checking idempotency:', error);
    throw new Error(`Failed to check idempotency: ${error.message}`);
  }

  return !!data;
}

/**
 * Deduct credits from a user account
 */
export async function deductCredits({
  userId,
  amount,
  source,
  idempotencyKey,
  refType,
  refId,
  metadata
}: CreditTransaction): Promise<boolean> {
  if (amount <= 0) return true;
  
  // If idempotency key provided, check if transaction already exists
  if (idempotencyKey) {
    const existing = await idem(idempotencyKey);
    if (existing) return true; // Transaction already processed
  }

  // Check if user has enough balance
  const balance = await getBalance(userId);
  if (balance < amount) {
    return false; // Insufficient funds
  }
  
  const { error } = await supabaseAdmin.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_idempotency_key: idempotencyKey,
    p_ref_type: refType,
    p_ref_id: refId,
    p_metadata: metadata
  });

  if (error) {
    console.error('Error deducting credits:', error);
    throw new Error(`Failed to deduct credits: ${error.message}`);
  }

  return true;
}
