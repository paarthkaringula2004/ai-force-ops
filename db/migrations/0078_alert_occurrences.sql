-- Keep one alert per underlying issue and only timestamps for new occurrences.
CREATE TABLE platform_alert_occurrences (
    alert_id uuid NOT NULL REFERENCES platform_alerts(id) ON DELETE CASCADE,
    occurred_at timestamptz NOT NULL,
    PRIMARY KEY (alert_id, occurred_at)
);

INSERT INTO platform_alert_occurrences(alert_id, occurred_at)
SELECT id, created_at FROM platform_alerts;

CREATE FUNCTION record_platform_alert_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO platform_alert_occurrences VALUES (NEW.id, NEW.created_at)
        ON CONFLICT DO NOTHING;
    ELSIF NEW.state = 'active' AND (
        OLD.state <> 'active' OR
        (NEW.summary, NEW.detail, NEW.severity) IS DISTINCT FROM
        (OLD.summary, OLD.detail, OLD.severity)
    ) THEN
        INSERT INTO platform_alert_occurrences VALUES (NEW.id, NEW.updated_at)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER platform_alert_occurrence_history
AFTER INSERT OR UPDATE ON platform_alerts FOR EACH ROW
EXECUTE FUNCTION record_platform_alert_occurrence();

-- Alertmanager relays our own alerts back to us. Their authoritative records
-- already exist in platform_alerts, so do not store another full JSON payload.
CREATE FUNCTION ignore_platform_alert_mirror() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind = 'alerts' AND EXISTS (
        SELECT 1 FROM platform_alerts a
        WHERE a.id::text = NEW.data->'labels'->>'platform_alert_id'
          AND a.user_id = NEW.user_id
          AND NEW.data->'labels'->>'account' =
              left(encode(sha256(convert_to(NEW.user_id, 'UTF8')), 'hex'), 24)
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER eassist_avoid_platform_alert_mirrors
BEFORE INSERT OR UPDATE ON eassist_records FOR EACH ROW
EXECUTE FUNCTION ignore_platform_alert_mirror();

DELETE FROM eassist_records r USING platform_alerts a
WHERE r.kind = 'alerts'
  AND a.id::text = r.data->'labels'->>'platform_alert_id'
  AND a.user_id = r.user_id
  AND r.data->'labels'->>'account' =
      left(encode(sha256(convert_to(r.user_id, 'UTF8')), 'hex'), 24);
