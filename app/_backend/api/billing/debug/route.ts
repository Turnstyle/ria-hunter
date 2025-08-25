// app/_backend/api/billing/debug/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const CREDITS_SECRET = process.env.CREDITS_SECRET;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2024-06-20' 
});

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_table_exists', {
      table_name: tableName
    });
    
    if (error) {
      // If the function doesn't exist, try a different approach
      if (error.code === '42883') {
        // Query the information_schema directly
        const { data: schemaData, error: schemaError } = await supabaseAdmin.from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')
          .eq('table_name', tableName)
          .maybeSingle();
          
        if (schemaError) {
          console.error(`Error checking table existence via schema: ${schemaError.message}`);
          return false;
        }
        
        return !!schemaData;
      }
      
      console.error(`Error checking table existence: ${error.message}`);
      return false;
    }
    
    return !!data;
  } catch (err) {
    console.error(`Error in tableExists: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Get user account by email
 */
async function getUserByEmail(email: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('email', email)
      .maybeSingle();
      
    if (error) {
      if (error.code === '42P01') { // Relation does not exist
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (err) {
    console.error(`Error getting user by email: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Get Stripe subscription info for a customer (sanitized)
 */
async function getStripeSubscriptionInfo(customerId: string) {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all'
    });
    
    if (!subscriptions.data.length) {
      return null;
    }
    
    const sub = subscriptions.data[0];
    
    // Return sanitized subscription info
    return {
      id: sub.id,
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
      plan: sub.items.data[0]?.price?.product,
      is_active: ['active', 'trialing'].includes(sub.status) && !sub.cancel_at_period_end
    };
  } catch (err) {
    console.error(`Error getting Stripe subscription: ${(err as Error).message}`);
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Check for authorization header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== CREDITS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if email parameter was provided
  const searchParams = req.nextUrl.searchParams;
  const email = searchParams.get('email');
  
  // Check for required tables
  const [userAccountsExists, creditTransactionsExists, stripeEventsExists] = await Promise.all([
    tableExists('user_accounts'),
    tableExists('credit_transactions'),
    tableExists('stripe_events')
  ]);
  
  // Create response object
  const response: any = {
    ok: true,
    tables: {
      user_accounts: userAccountsExists,
      credit_transactions: creditTransactionsExists,
      stripe_events: stripeEventsExists
    }
  };
  
  // If email was provided, try to look up the user
  if (email) {
    const userAccount = await getUserByEmail(email);
    
    response.sample = {
      email,
      userAccount
    };
    
    // If user has a Stripe customer ID, get subscription info
    if (userAccount?.stripe_customer_id) {
      response.sample.stripeSubscription = await getStripeSubscriptionInfo(userAccount.stripe_customer_id);
    }
  }
  
  return NextResponse.json(response);
}
