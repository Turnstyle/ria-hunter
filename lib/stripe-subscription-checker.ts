import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20'
})

export interface SubscriptionStatus {
  isSubscriber: boolean
  status?: string
  planName?: string
  currentPeriodEnd?: string
  trialEnd?: string
  source: 'database' | 'stripe' | 'none'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

/**
 * Check subscription status for a user by:
 * 1. First checking the database
 * 2. If not found or inactive, checking Stripe directly by email
 * 3. If found in Stripe but missing from DB, updating the database
 */
export async function checkSubscriptionStatus(userId: string, userEmail?: string): Promise<SubscriptionStatus> {
  try {
    console.log(`[subscription-checker] Checking status for user: ${userId}, email: ${userEmail}`)

    // Step 1: Check database first
    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!error && subscription) {
      const isActive = ['active', 'trialing'].includes(subscription.status)
      console.log(`[subscription-checker] Found in database: ${subscription.status}, active: ${isActive}`)
      
      if (isActive) {
        return {
          isSubscriber: true,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.status === 'trialing' ? subscription.current_period_end : undefined,
          source: 'database',
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id
        }
      }
    }

    // Step 2: If no active subscription in DB, check Stripe directly
    if (userEmail && process.env.STRIPE_SECRET_KEY) {
      console.log(`[subscription-checker] Checking Stripe directly for email: ${userEmail}`)
      
      try {
        // Find customer by email
        const customers = await stripe.customers.list({
          email: userEmail,
          limit: 1
        })

        if (customers.data.length > 0) {
          const customer = customers.data[0]
          console.log(`[subscription-checker] Found Stripe customer: ${customer.id}`)

          // Get active subscriptions for this customer
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 10
          })

          // Find the most recent active subscription
          const activeSubscription = subscriptions.data.find(sub => 
            ['active', 'trialing'].includes(sub.status) && !sub.cancel_at_period_end
          )

          if (activeSubscription) {
            console.log(`[subscription-checker] Found active Stripe subscription: ${activeSubscription.id}, status: ${activeSubscription.status}`)

            // Get plan details
            const price = activeSubscription.items.data[0]?.price
            const planName = price?.nickname || price?.product?.toString() || 'Pro Plan'

            // Update database with the subscription we found
            const { error: upsertError } = await supabaseAdmin
              .from('subscriptions')
              .upsert({
                user_id: userId,
                stripe_customer_id: customer.id,
                stripe_subscription_id: activeSubscription.id,
                status: activeSubscription.status,
                current_period_end: new Date(activeSubscription.current_period_end * 1000).toISOString(),
                updated_at: new Date().toISOString()
              })

            if (upsertError) {
              console.error(`[subscription-checker] Error updating database:`, upsertError)
            } else {
              console.log(`[subscription-checker] Successfully updated database with Stripe subscription`)
            }

            return {
              isSubscriber: true,
              status: activeSubscription.status,
              planName,
              currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000).toISOString(),
              trialEnd: activeSubscription.status === 'trialing' 
                ? new Date(activeSubscription.current_period_end * 1000).toISOString() 
                : undefined,
              source: 'stripe',
              stripeCustomerId: customer.id,
              stripeSubscriptionId: activeSubscription.id
            }
          }
        }
      } catch (stripeError) {
        console.error(`[subscription-checker] Stripe API error:`, stripeError)
      }
    }

    // Step 3: No active subscription found anywhere
    console.log(`[subscription-checker] No active subscription found`)
    return {
      isSubscriber: false,
      source: 'none'
    }

  } catch (error) {
    console.error(`[subscription-checker] Error checking subscription status:`, error)
    return {
      isSubscriber: false,
      source: 'none'
    }
  }
}

/**
 * Get user email from Supabase Auth
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error || !data.user?.email) {
      console.log(`[subscription-checker] Could not get email for user ${userId}:`, error?.message)
      return null
    }
    return data.user.email
  } catch (error) {
    console.error(`[subscription-checker] Error getting user email:`, error)
    return null
  }
}
