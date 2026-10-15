ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS cached_input_tokens integer;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS cache_write_tokens integer;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS usage_kind text NOT NULL DEFAULT 'provider';
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS billing jsonb;
ALTER TABLE usage_events ADD CONSTRAINT usage_cached_tokens_valid CHECK (cached_input_tokens IS NULL OR (cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens));
ALTER TABLE usage_events ADD CONSTRAINT usage_kind_valid CHECK (usage_kind IN ('provider', 'local'));
ALTER TABLE usage_events ADD CONSTRAINT usage_cache_writes_valid CHECK (cache_write_tokens IS NULL OR (cache_write_tokens >= 0 AND cache_write_tokens + COALESCE(cached_input_tokens,0) <= input_tokens));
