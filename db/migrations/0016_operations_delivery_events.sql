CREATE FUNCTION platform_delivery_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
 SELECT user_id INTO owner_id FROM platform_alerts WHERE id=COALESCE(NEW.alert_id,OLD.alert_id);
 IF owner_id IS NOT NULL AND EXISTS(SELECT 1 FROM "user" WHERE id=owner_id) THEN
  INSERT INTO eassist_revisions(user_id,revision) VALUES(owner_id,1)
  ON CONFLICT(user_id) DO UPDATE SET revision=eassist_revisions.revision+1;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER platform_delivery_live AFTER INSERT OR UPDATE OR DELETE ON platform_alert_deliveries FOR EACH ROW EXECUTE FUNCTION platform_delivery_changed();
-- Upgrade early backfill identities to use the originating run, like new signals.
DELETE FROM platform_alerts a USING epace_records r,platform_alerts current
 WHERE r.user_id=a.user_id AND r.kind='alert' AND r.data->>'runId' IS NOT NULL
 AND a.source='epace' AND a.event_key='quality:'||r.id AND current.user_id=a.user_id
 AND current.source=a.source AND current.event_key='run:'||(r.data->>'runId') AND current.id<>a.id;
UPDATE platform_alerts a SET event_key='run:'||(r.data->>'runId') FROM epace_records r
 WHERE r.user_id=a.user_id AND r.kind='alert' AND r.data->>'runId' IS NOT NULL
 AND a.source='epace' AND a.event_key='quality:'||r.id;
