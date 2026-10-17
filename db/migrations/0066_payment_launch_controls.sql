ALTER TABLE payment_configurations
ADD COLUMN merchant_policies jsonb NOT NULL DEFAULT '{}';

ALTER TABLE payment_configurations
ADD COLUMN live_acknowledged_at timestamptz;