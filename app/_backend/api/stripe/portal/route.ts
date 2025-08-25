// app/_backend/api/stripe/portal/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2024-06-20' 
});

export async function POST(req: NextRequest) {
  try {
    // Get auth client
    const supabaseAuth = createRouteHandlerClient({ cookies });
    
    // Try to get the authenticated user's email
    const { data: { user } } = await supabaseAuth.auth.getUser();
    const userEmail = user?.email;
    
    if (!userEmail) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Find or create Stripe customer for this user
    let customerId: string;
    
    // Check if user already has a Stripe customer ID
    const { data: userAccount, error } = await supabaseAdmin
      .from('user_accounts')
      .select('id, stripe_customer_id')
      .eq('email', userEmail)
      .maybeSingle();
    
    if (userAccount?.stripe_customer_id) {
      customerId = userAccount.stripe_customer_id;
    } else {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          user_email: userEmail
        }
      });
      
      customerId = customer.id;
      
      // Store the customer ID in the database
      if (userAccount?.id) {
        // Update existing user
        await supabaseAdmin
          .from('user_accounts')
          .update({ stripe_customer_id: customerId })
          .eq('id', userAccount.id);
      } else {
        // Create new user account
        await supabaseAdmin
          .from('user_accounts')
          .insert({
            email: userEmail,
            stripe_customer_id: customerId,
            is_pro: false
          });
      }
    }
    
    // Create Stripe billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://ria-hunter.app'}/account`,
    });
    
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
