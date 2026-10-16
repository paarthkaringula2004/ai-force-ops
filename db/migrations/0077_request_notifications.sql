CREATE TABLE request_notification_receipts (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id uuid NOT NULL REFERENCES employee_service_requests(id) ON DELETE CASCADE,
 dismissed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
CREATE INDEX employee_requests_pending_notifications ON employee_service_requests(created_at,id) WHERE status='pending_approval';
CREATE FUNCTION broadcast_request_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('aiforce_request_updates','changed');
 RETURN NULL;
END;
$$;
CREATE TRIGGER request_update_notifications AFTER INSERT OR UPDATE OR DELETE ON employee_service_requests
 FOR EACH STATEMENT EXECUTE FUNCTION broadcast_request_update();
CREATE TRIGGER request_receipt_notifications AFTER INSERT OR UPDATE OR DELETE ON request_notification_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION broadcast_request_update();
CREATE TRIGGER request_membership_notifications AFTER UPDATE ON workspace_members
 FOR EACH STATEMENT EXECUTE FUNCTION broadcast_request_update();
