-- Migration: Add stripe_events_processed table
-- Created: 2025-08-25
-- Purpose: Prevent duplicate processing of Stripe webhook events

-- Table to track processed Stripe webhook events
CREATE TABLE IF NOT EXISTS stripe_events_processed (
    event_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for faster lookups (though primary key already has an index)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_event_id ON stripe_events_processed(event_id);

-- Enable RLS but allow service role full access
ALTER TABLE stripe_events_processed ENABLE ROW LEVEL SECURITY;

-- Service role can insert/select records
CREATE POLICY "Service role can manage stripe_events_processed" ON stripe_events_processed
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
