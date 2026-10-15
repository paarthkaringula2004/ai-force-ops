CREATE TABLE payment_configurations (
 id uuid PRIMARY KEY, mode text NOT NULL CHECK(mode IN('test','live')),
 key_id text NOT NULL, key_cipher text NOT NULL, webhook_cipher text NOT NULL,
 public_origin text NOT NULL, business_name text NOT NULL,
 enabled boolean NOT NULL DEFAULT false, verified_at timestamptz,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_settings (id boolean PRIMARY KEY DEFAULT true CHECK(id), configuration_id uuid REFERENCES payment_configurations(id));
INSERT INTO payment_settings(id) VALUES(true);
CREATE TABLE payment_orders (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 configuration_id uuid NOT NULL REFERENCES payment_configurations(id),
 tickets integer NOT NULL CHECK(tickets IN(100,250,500,1000,2000,5000)),
 amount integer NOT NULL CHECK(amount>0), currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 mode text NOT NULL CHECK(mode IN('test','live')),
 state text NOT NULL DEFAULT 'creating' CHECK(state IN('creating','pending','unknown','paid','test_paid')),
 provider_order_id text UNIQUE, provider_payment_id text UNIQUE,
 credited_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_orders_owner ON payment_orders(user_id,created_at DESC);
CREATE TABLE payment_events(id text PRIMARY KEY,order_id uuid NOT NULL REFERENCES payment_orders(id),kind text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE ticket_wallets ADD COLUMN paid_balance bigint NOT NULL DEFAULT 0 CHECK(paid_balance>=0);
ALTER TABLE ticket_ledger DROP CONSTRAINT ticket_ledger_kind_check;
ALTER TABLE ticket_ledger ADD CONSTRAINT ticket_ledger_kind_check CHECK(kind IN('welcome','topup','usage','refill','role_policy','purchase'));
ALTER TABLE ticket_ledger ADD COLUMN payment_order_id uuid UNIQUE REFERENCES payment_orders(id);
CREATE OR REPLACE FUNCTION refresh_ticket_wallet(target text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE member_role text; wallet ticket_wallets%ROWTYPE; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; allowance bigint; next_balance bigint; reason text;
BEGIN
 SELECT role INTO member_role FROM workspace_members WHERE user_id=target;
 SELECT * INTO wallet FROM ticket_wallets WHERE user_id=target FOR UPDATE;
 IF wallet.user_id IS NULL THEN RETURN NULL; END IF;
 allowance := CASE member_role WHEN 'employee' THEN 50 WHEN 'manager' THEN 100 ELSE NULL END;
 IF member_role<>wallet.policy_role THEN
  next_balance := wallet.paid_balance+COALESCE(allowance,CASE WHEN member_role='user' THEN 5 ELSE GREATEST(0,wallet.balance-wallet.paid_balance) END); reason := 'role_policy';
 ELSIF allowance IS NOT NULL AND wallet.last_refill_date<today THEN
  next_balance := allowance+wallet.paid_balance; reason := 'refill';
 ELSE RETURN wallet.balance;
 END IF;
 UPDATE ticket_wallets SET balance=next_balance,policy_role=member_role,last_refill_date=today,updated_at=now() WHERE user_id=target;
 INSERT INTO ticket_ledger(id,user_id,amount,kind) VALUES(gen_random_uuid(),target,next_balance-wallet.balance,reason);
 RETURN next_balance;
END $$;
