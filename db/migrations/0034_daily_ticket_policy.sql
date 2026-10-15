ALTER TABLE ticket_wallets ADD COLUMN policy_role text NOT NULL DEFAULT 'user';
ALTER TABLE ticket_wallets ADD COLUMN last_refill_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date;
ALTER TABLE ticket_ledger DROP CONSTRAINT ticket_ledger_kind_check;
ALTER TABLE ticket_ledger ADD CONSTRAINT ticket_ledger_kind_check CHECK(kind IN('welcome','topup','usage','refill','role_policy'));
CREATE FUNCTION refresh_ticket_wallet(target text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE member_role text; wallet ticket_wallets%ROWTYPE; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; allowance bigint; next_balance bigint; reason text;
BEGIN
 SELECT role INTO member_role FROM workspace_members WHERE user_id=target;
 SELECT * INTO wallet FROM ticket_wallets WHERE user_id=target FOR UPDATE;
 IF wallet.user_id IS NULL THEN RETURN NULL; END IF;
 allowance := CASE member_role WHEN 'employee' THEN 50 WHEN 'manager' THEN 100 ELSE NULL END;
 IF member_role<>wallet.policy_role THEN
  next_balance := COALESCE(allowance,CASE WHEN member_role='user' THEN 5 ELSE wallet.balance END); reason := 'role_policy';
 ELSIF allowance IS NOT NULL AND wallet.last_refill_date<today THEN
  next_balance := allowance; reason := 'refill';
 ELSE RETURN wallet.balance;
 END IF;
 UPDATE ticket_wallets SET balance=next_balance,policy_role=member_role,last_refill_date=today,updated_at=now() WHERE user_id=target;
 INSERT INTO ticket_ledger(id,user_id,amount,kind) VALUES(gen_random_uuid(),target,next_balance-wallet.balance,reason);
 RETURN next_balance;
END $$;
CREATE FUNCTION change_ticket_role_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM refresh_ticket_wallet(NEW.user_id); RETURN NEW; END $$;
CREATE TRIGGER ticket_role_policy AFTER UPDATE OF role ON workspace_members FOR EACH ROW WHEN(OLD.role IS DISTINCT FROM NEW.role) EXECUTE FUNCTION change_ticket_role_policy();
SELECT refresh_ticket_wallet(user_id) FROM workspace_members;
