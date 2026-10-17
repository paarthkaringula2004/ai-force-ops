CREATE TABLE platform_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    source text NOT NULL,
    action text NOT NULL,
    resource_id text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'success',
    summary text NOT NULL,
    href text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_events_owner_time ON platform_events (user_id, created_at DESC);

CREATE TABLE platform_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    source text NOT NULL,
    event_key text NOT NULL,
    severity text NOT NULL DEFAULT 'warning',
    summary text NOT NULL,
    detail text NOT NULL DEFAULT '',
    href text NOT NULL DEFAULT '',
    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'acknowledged', 'resolved')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, source, event_key)
);

CREATE INDEX platform_alerts_owner_state ON platform_alerts (user_id, state, updated_at DESC);

CREATE TABLE platform_alert_deliveries (
    connection_id uuid NOT NULL REFERENCES eassist_connections (id) ON DELETE CASCADE,
    alert_id uuid NOT NULL REFERENCES platform_alerts (id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    last_error text NOT NULL DEFAULT '',
    checked_at timestamptz,
    next_attempt timestamptz NOT NULL DEFAULT now(),
    lease_until timestamptz,
    PRIMARY KEY (connection_id, alert_id)
);

CREATE TRIGGER platform_events_live
AFTER INSERT OR UPDATE OR DELETE ON platform_events FOR EACH ROW
EXECUTE FUNCTION eassist_changed ();

CREATE TRIGGER platform_alerts_live
AFTER INSERT OR UPDATE OR DELETE ON platform_alerts FOR EACH ROW
EXECUTE FUNCTION eassist_changed ();

CREATE FUNCTION platform_capture_change () RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; old_data jsonb; owner_id text; resource text; area text; action_name text; status_name text := 'success';
 href text; title text; alert_key text; emit_alert boolean := false; resolve_alert boolean := false;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_data := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 owner_id := row_data->>'user_id'; area := TG_ARGV[0]; action_name := TG_ARGV[1];
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM "user" WHERE id=owner_id) THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND (row_data-'updated_at'-'observed_at'-'checked_at'-'sync_after'-'lease_until')=(old_data-'updated_at'-'observed_at'-'checked_at'-'sync_after'-'lease_until') THEN RETURN NULL; END IF;
 resource := COALESCE(row_data->>'id',row_data->>'agent_id',row_data->>'public_id','');
 href := CASE area WHEN 'agent-studio' THEN '/dashboard/agents' WHEN 'reactflow' THEN '/agent-builder/'||resource WHEN 'epace' THEN '/service-review-center/epace' WHEN 'review-center' THEN '/service-review-center' ELSE '/service-review-center/eassist?view=activity' END;
 IF TG_TABLE_NAME='epace_records' THEN
  action_name := 'ePACE '||(row_data->>'kind');
  IF row_data->>'kind'='run' THEN
   status_name := COALESCE(row_data->'data'->>'status','pending');
   IF TG_OP='UPDATE' AND row_data->'data'->>'status' IS NOT DISTINCT FROM old_data->'data'->>'status' THEN RETURN NULL; END IF;
   emit_alert := status_name IN ('error','blocked'); alert_key := 'run:'||resource;
   title := CASE status_name WHEN 'blocked' THEN 'ePACE safety policy blocked a run' ELSE 'ePACE run failed' END;
   href := '/service-review-center/epace';
  ELSIF row_data->>'kind'='alert' THEN
   alert_key := CASE WHEN row_data->'data'->>'runId' IS NOT NULL THEN 'run:'||(row_data->'data'->>'runId') ELSE 'quality:'||resource END; title := 'ePACE quality or safety alert';
   emit_alert := COALESCE(row_data->'data'->>'resolved','false') <> 'true';
   resolve_alert := NOT emit_alert; status_name := CASE WHEN emit_alert THEN 'warning' ELSE 'resolved' END;
  END IF;
 ELSIF TG_TABLE_NAME='eassist_connections' THEN
  IF TG_OP='UPDATE' AND row_data->>'state' IS NOT DISTINCT FROM old_data->>'state' AND row_data->>'enabled' IS NOT DISTINCT FROM old_data->>'enabled' THEN RETURN NULL; END IF;
  status_name := COALESCE(row_data->>'state','unverified'); alert_key := 'connection:'||resource;
  emit_alert := status_name='error' AND (row_data->>'enabled')::boolean;
  resolve_alert := status_name='connected' OR NOT (row_data->>'enabled')::boolean OR TG_OP='DELETE';
  title := 'Operational integration connection failed'; href := '/service-review-center/eassist?view=status';
 ELSIF TG_TABLE_NAME='eassist_records' THEN
  IF row_data->>'kind' <> 'tasks' THEN RETURN NULL; END IF;
  IF TG_OP='UPDATE' AND row_data->'data'->>'status' IS NOT DISTINCT FROM old_data->'data'->>'status' THEN RETURN NULL; END IF;
  status_name := COALESCE(row_data->'data'->>'status','unknown'); resource := (row_data->>'connection_id')||':'||(row_data->>'external_id');
  alert_key := 'task:'||resource; emit_alert := status_name IN ('error','failed'); resolve_alert := status_name='success';
  title := 'Semaphore automation task failed'; href := '/service-review-center/eassist?view=templates';
 END IF;
 INSERT INTO platform_events(user_id,source,action,resource_id,status,summary,href)
 VALUES(owner_id,area,action_name||' '||lower(TG_OP),resource,CASE WHEN TG_OP='DELETE' THEN 'deleted' ELSE status_name END,action_name||' '||lower(TG_OP)||' ('||status_name||')',href);
 IF TG_OP='DELETE' THEN emit_alert := false; resolve_alert := true; END IF;
 IF emit_alert THEN
  INSERT INTO platform_alerts(user_id,source,event_key,severity,summary,detail,href)
  VALUES(owner_id,area,alert_key,CASE WHEN status_name IN ('error','failed') THEN 'critical' ELSE 'warning' END,title,'Open the source workspace to inspect the saved run, policy or connection details.',href)
  ON CONFLICT(user_id,source,event_key) DO UPDATE SET updated_at=now() WHERE platform_alerts.state='active';
 ELSIF resolve_alert AND alert_key IS NOT NULL THEN
  UPDATE platform_alerts SET state='resolved',updated_at=now() WHERE user_id=owner_id AND source=area AND event_key=alert_key AND state<>'resolved';
 END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER platform_track_agents
AFTER INSERT OR UPDATE OR DELETE ON agents FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('agent-studio', 'Agent');

CREATE TRIGGER platform_track_agent_workflows
AFTER INSERT OR UPDATE OR DELETE ON agent_workflows FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('reactflow', 'Workflow graph');

CREATE TRIGGER platform_track_published_agents
AFTER INSERT OR UPDATE OR DELETE ON published_agents FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('agent-studio', 'Agent publication');

CREATE TRIGGER platform_track_tools
AFTER INSERT OR UPDATE OR DELETE ON tools FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('agent-studio', 'Tool');

CREATE TRIGGER platform_track_tool_knowledge
AFTER INSERT OR UPDATE OR DELETE ON tool_knowledge FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('agent-studio', 'Tool analysis');

CREATE TRIGGER platform_track_playground_settings
AFTER INSERT OR UPDATE OR DELETE ON playground_settings FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('agent-studio', 'Playground configuration');

CREATE TRIGGER platform_track_epace_projects
AFTER INSERT OR UPDATE OR DELETE ON epace_projects FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('epace', 'Project configuration');

CREATE TRIGGER platform_track_epace_records
AFTER INSERT OR UPDATE OR DELETE ON epace_records FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('epace', 'Project record');

CREATE TRIGGER platform_track_eassist_connections
AFTER INSERT OR UPDATE OR DELETE ON eassist_connections FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('eassist', 'Integration');

CREATE TRIGGER platform_track_eassist_records
AFTER INSERT OR UPDATE OR DELETE ON eassist_records FOR EACH ROW
EXECUTE FUNCTION platform_capture_change ('semaphore', 'Automation task');

-- Recover existing unresolved safety/quality signals, without copying prompts or documents.
INSERT INTO
    platform_alerts (
        user_id,
        source,
        event_key,
        summary,
        detail,
        href,
        created_at
    )
SELECT
    user_id,
    'epace',
    CASE
        WHEN data ->> 'runId' IS NOT NULL THEN 'run:' || (data ->> 'runId')
        ELSE 'quality:' || id
    END,
    'ePACE quality or safety alert',
    'Inspect the source alert in ePACE.',
    '/service-review-center/epace',
    created_at
FROM
    epace_records
WHERE
    kind = 'alert'
    AND COALESCE(data ->> 'resolved', 'false') <> 'true'
ON CONFLICT DO NOTHING;