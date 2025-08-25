-- Update stripe_events table to include payload field
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS payload JSONB;

-- Create a comment explaining the purpose of this field
COMMENT ON COLUMN public.stripe_events.payload IS 'Stores the full Stripe event payload for debugging and auditing purposes';

-- Update the table comment
COMMENT ON TABLE public.stripe_events IS 'Records processed Stripe webhook events for idempotency checks and audit logs';
