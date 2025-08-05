-- Migration: Add authentication and subscription tracking tables
-- Created: 2025-08-05
-- Purpose: Support Google OAuth authentication and Stripe subscription management

-- Table to log each query usage for free tier limits
CREATE TABLE IF NOT EXISTS user_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table to log share-for-credit events (LinkedIn share bonus)
CREATE TABLE IF NOT EXISTS user_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table to track Stripe subscription status
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id UUID PRIMARY KEY REFERENCES auth.users,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT, -- e.g. 'trialing', 'active', 'canceled', 'past_due'
    current_period_end TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_queries_user_id_created_at ON user_queries(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_shares_user_id_shared_at ON user_shares(user_id, shared_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Row Level Security (RLS) policies
ALTER TABLE user_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own query logs
CREATE POLICY "Users can view own query logs" ON user_queries
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own share logs
CREATE POLICY "Users can view own share logs" ON user_shares
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only see their own subscription status
CREATE POLICY "Users can view own subscription" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert/update all records (for API usage tracking and webhook handling)
CREATE POLICY "Service role can manage user_queries" ON user_queries
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage user_shares" ON user_shares
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage subscriptions" ON subscriptions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update subscription updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on subscription changes
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();