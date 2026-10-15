CREATE TABLE ticket_wallets (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 balance bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ticket_ledger (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 amount bigint NOT NULL, kind text NOT NULL CHECK(kind IN('welcome','topup','usage')),
 usage_id uuid UNIQUE REFERENCES usage_events(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION create_ticket_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO ticket_wallets(user_id,balance) VALUES(NEW.user_id,CASE WHEN NEW.role='user' THEN 5 ELSE 0 END);
 IF NEW.role='user' THEN INSERT INTO ticket_ledger(id,user_id,amount,kind) VALUES(gen_random_uuid(),NEW.user_id,5,'welcome'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_ticket_wallet AFTER INSERT ON workspace_members FOR EACH ROW EXECUTE FUNCTION create_ticket_wallet();
INSERT INTO ticket_wallets(user_id,balance) SELECT user_id,CASE WHEN role='user' THEN 5 ELSE 0 END FROM workspace_members;
INSERT INTO ticket_ledger(id,user_id,amount,kind) SELECT gen_random_uuid(),user_id,5,'welcome' FROM workspace_members WHERE role='user';
