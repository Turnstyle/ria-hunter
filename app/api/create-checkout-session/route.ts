import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

interface CheckoutRequest {
  priceId?: string;
}

/**
 * Creates a Stripe Checkout Session for RIA Hunter Pro subscription
 * Protected by middleware - requires authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    // Extract user info from middleware headers
    const userId = req.headers.get('x-user-id');
    const userEmail = req.headers.get('x-user-email');

    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'User authentication required' },
        { status: 401 }
      );
    }

    const body: CheckoutRequest = await req.json();
    const priceId = body.priceId || process.env.STRIPE_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { error: 'Price ID not configured' },
        { status: 500 }
      );
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7, // 7-day free trial
        metadata: {
          user_id: userId, // Store user ID for webhook processing
        },
      },
      client_reference_id: userId, // Also store in session for redundancy
      success_url: `${FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/subscription/cancel`,
      allow_promotion_codes: true, // Allow discount codes
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error: any) {
    console.error('Stripe checkout session creation error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: 'Payment method error: ' + error.message },
        { status: 400 }
      );
    }
    
    if (error.type === 'StripeRateLimitError') {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: 'Invalid request: ' + error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new Response(null, { 
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}