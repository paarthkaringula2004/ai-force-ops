ALTER TABLE payment_configurations ADD COLUMN webhook_verified_at timestamptz;
ALTER TABLE payment_orders ADD COLUMN provider_status text;
ALTER TABLE payment_orders ADD COLUMN checked_at timestamptz;
ALTER TABLE payment_orders ADD COLUMN refunded_amount integer NOT NULL DEFAULT 0 CHECK(refunded_amount>=0);
ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_state_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_state_check CHECK(state IN('creating','pending','unknown','paid','test_paid','failed','refunded','refund_review'));
CREATE INDEX payment_orders_review ON payment_orders(state,created_at);
