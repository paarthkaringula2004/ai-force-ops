CREATE TABLE IF NOT EXISTS account_profiles (
  user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '',
  birthday date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tools (
  id uuid NOT NULL,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  purpose text NOT NULL DEFAULT '',
  method varchar(8) NOT NULL DEFAULT 'GET' CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  endpoint_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS tools_user_updated_idx ON tools (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tool_knowledge (
  user_id text NOT NULL,
  tool_id uuid NOT NULL,
  summary text NOT NULL,
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_id varchar(200) NOT NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tool_id),
  FOREIGN KEY (user_id, tool_id) REFERENCES tools (user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  source varchar(40) NOT NULL,
  model_id varchar(200) NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON usage_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS published_agents (
  id uuid PRIMARY KEY,
  public_id uuid NOT NULL,
  user_id text NOT NULL,
  agent_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  snapshot jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id, version),
  FOREIGN KEY (user_id, agent_id) REFERENCES agents (user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS published_agents_owner_idx ON published_agents (user_id, agent_id, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS published_agents_active_public_id_idx ON published_agents (public_id) WHERE active;

CREATE TABLE IF NOT EXISTS published_conversations (
  public_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (public_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS published_conversations_updated_idx ON published_conversations (updated_at DESC);
