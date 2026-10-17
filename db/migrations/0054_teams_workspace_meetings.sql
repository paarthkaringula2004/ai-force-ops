ALTER TABLE meeting_rooms
ADD COLUMN location_kind text NOT NULL DEFAULT 'job' CHECK (location_kind IN ('job', 'specific'));

CREATE TABLE teams_user_connections (
    user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
    microsoft_id text NOT NULL,
    account_name text NOT NULL,
    account_email text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    scopes text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams_oauth_states (
    state_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    verifier text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);

CREATE TABLE workspace_virtual_meetings (
    id uuid PRIMARY KEY,
    organizer_id text NOT NULL REFERENCES "user" (id),
    title varchar(150) NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    kind text NOT NULL CHECK (kind IN ('now', 'scheduled')),
    status text NOT NULL DEFAULT 'creating' CHECK (
        status IN ('creating', 'ready', 'cancelling', 'cancelled')
    ),
    provider_id text,
    join_url text,
    meeting_id text,
    passcode text,
    created_at timestamptz NOT NULL DEFAULT now(),
    removed_at timestamptz
);

CREATE INDEX workspace_virtual_meeting_owner ON workspace_virtual_meetings (organizer_id, starts_at);

CREATE TABLE workspace_meeting_invites (
    id uuid PRIMARY KEY,
    virtual_id uuid REFERENCES workspace_virtual_meetings (id),
    booking_id uuid REFERENCES meeting_room_bookings (id),
    sender_id text NOT NULL REFERENCES "user" (id),
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    notified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (virtual_id IS NOT NULL)::int + (booking_id IS NOT NULL)::int = 1
    )
);

CREATE UNIQUE INDEX meeting_invite_virtual_recipient ON workspace_meeting_invites (virtual_id, user_id)
WHERE
    virtual_id IS NOT NULL;

CREATE UNIQUE INDEX meeting_invite_booking_recipient ON workspace_meeting_invites (booking_id, user_id)
WHERE
    booking_id IS NOT NULL;

CREATE INDEX meeting_invite_recipient ON workspace_meeting_invites (user_id, created_at DESC);