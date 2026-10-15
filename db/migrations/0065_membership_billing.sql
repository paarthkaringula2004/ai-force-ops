ALTER TABLE payment_configurations ADD COLUMN membership_plans jsonb NOT NULL DEFAULT '{}';
CREATE TABLE payment_subscriptions(
 id uuid PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 configuration_id uuid NOT NULL REFERENCES payment_configurations(id),
 plan text NOT NULL CHECK(plan IN('monthly','weekly','lite')),provider_plan_id text NOT NULL,
 mode text NOT NULL CHECK(mode IN('test','live')),status text NOT NULL DEFAULT 'creating',
 total_cycles integer NOT NULL CHECK(total_cycles BETWEEN 1 AND 120),provider_id text UNIQUE,checkout_url text,
 cancel_requested boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_subscriptions_owner ON payment_subscriptions(user_id,created_at DESC);
CREATE TABLE membership_cycles(
 id uuid PRIMARY KEY,subscription_id uuid NOT NULL REFERENCES payment_subscriptions(id),
 provider_payment_id text NOT NULL UNIQUE,provider_invoice_id text NOT NULL UNIQUE,
 mode text NOT NULL CHECK(mode IN('test','live')),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 days integer NOT NULL CHECK(days IN(7,30)),instant integer NOT NULL,daily integer NOT NULL,
 awarded_days integer NOT NULL DEFAULT 0,refund_review boolean NOT NULL DEFAULT false,refund_resolved boolean NOT NULL DEFAULT false,refunded_amount integer NOT NULL DEFAULT 0,resolved_refund_amount integer NOT NULL DEFAULT 0,refund_adjusted_tickets integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ticket_ledger DROP CONSTRAINT ticket_ledger_kind_check;
ALTER TABLE ticket_ledger ADD CONSTRAINT ticket_ledger_kind_check CHECK(kind IN('welcome','topup','usage','refill','role_policy','purchase','membership','refund_adjustment'));
ALTER TABLE ticket_ledger ADD COLUMN membership_cycle_id uuid REFERENCES membership_cycles(id);
ALTER TABLE payment_orders ADD COLUMN refund_adjusted_tickets integer NOT NULL DEFAULT 0;
ALTER TABLE payment_orders ADD COLUMN resolved_refund_amount integer NOT NULL DEFAULT 0;
CREATE FUNCTION award_membership_rewards(target text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cycle record; earned integer; delta integer;
BEGIN
 -- Every grant is serialized with wallet spending and other reward reads.
 PERFORM 1 FROM ticket_wallets WHERE user_id=target FOR UPDATE;
 FOR cycle IN SELECT c.* FROM membership_cycles c JOIN payment_subscriptions s ON s.id=c.subscription_id
 WHERE s.user_id=target AND c.mode='live' AND NOT c.refund_review AND c.awarded_days<c.days AND c.starts_at<=now()
 ORDER BY c.starts_at,c.id FOR UPDATE OF c LOOP
  earned:=LEAST(cycle.days,GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (LEAST(now(),cycle.ends_at)-cycle.starts_at))/86400)::integer));
  delta:=(earned-cycle.awarded_days)*cycle.daily;
  IF delta>0 THEN
   UPDATE ticket_wallets SET balance=balance+delta,paid_balance=paid_balance+delta,updated_at=now() WHERE user_id=target;
   INSERT INTO ticket_ledger(id,user_id,amount,kind,membership_cycle_id) VALUES(gen_random_uuid(),target,delta,'membership',cycle.id);
   UPDATE membership_cycles SET awarded_days=earned WHERE id=cycle.id;
  END IF;
 END LOOP;
END $$;
