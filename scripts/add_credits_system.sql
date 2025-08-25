-- User accounts table to store balance
CREATE TABLE IF NOT EXISTS user_accounts (
  user_id TEXT PRIMARY KEY,
  balance INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Credit transactions table for tracking all credit changes
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_accounts(user_id),
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('purchase', 'grant', 'migration', 'share', 'subscription')),
  idempotency_key TEXT UNIQUE,
  ref_type TEXT CHECK (ref_type IN ('welcome', 'monthly', 'purchase', 'share', 'promo')),
  ref_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON credit_transactions(user_id);

-- Create index on idempotency_key for faster lookups
CREATE INDEX IF NOT EXISTS credit_transactions_idempotency_key_idx ON credit_transactions(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Function to add credits to a user account
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id TEXT,
  p_amount INT,
  p_source TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_current_balance INT;
  v_new_balance INT;
BEGIN
  -- Get the current balance
  SELECT balance INTO v_current_balance
  FROM user_accounts
  WHERE user_id = p_user_id;
  
  -- Calculate the new balance
  v_new_balance := v_current_balance + p_amount;
  
  -- Update the user's balance
  UPDATE user_accounts
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Record the transaction
  INSERT INTO credit_transactions (
    user_id,
    amount,
    balance_after,
    source,
    idempotency_key,
    ref_type,
    ref_id,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,
    v_new_balance,
    p_source,
    p_idempotency_key,
    p_ref_type,
    p_ref_id,
    p_metadata
  );
END;
$$ LANGUAGE plpgsql;

-- Function to deduct credits from a user account
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id TEXT,
  p_amount INT,
  p_source TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_current_balance INT;
  v_new_balance INT;
BEGIN
  -- Get the current balance
  SELECT balance INTO v_current_balance
  FROM user_accounts
  WHERE user_id = p_user_id;
  
  -- Ensure the user has enough balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Calculate the new balance
  v_new_balance := v_current_balance - p_amount;
  
  -- Update the user's balance
  UPDATE user_accounts
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Record the transaction
  INSERT INTO credit_transactions (
    user_id,
    amount,
    balance_after,
    source,
    idempotency_key,
    ref_type,
    ref_id,
    metadata
  ) VALUES (
    p_user_id,
    -p_amount, -- Negative amount for deduction
    v_new_balance,
    p_source,
    p_idempotency_key,
    p_ref_type,
    p_ref_id,
    p_metadata
  );
END;
$$ LANGUAGE plpgsql;
