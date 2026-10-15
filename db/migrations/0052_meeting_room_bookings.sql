CREATE TABLE meeting_rooms (
 id uuid PRIMARY KEY, name varchar(100) NOT NULL, location varchar(200) NOT NULL DEFAULT '',
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 500), amenities text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(name,location)
);
CREATE TABLE meeting_room_bookings (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES meeting_rooms(id), user_id text NOT NULL REFERENCES "user"(id),
 title varchar(150) NOT NULL, attendees integer NOT NULL CHECK(attendees BETWEEN 1 AND 500),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), cancelled_at timestamptz
);
CREATE INDEX meeting_room_conflicts ON meeting_room_bookings(room_id,starts_at,ends_at) WHERE status='confirmed';
CREATE INDEX meeting_room_personal ON meeting_room_bookings(user_id,starts_at);
CREATE TABLE meeting_room_previews (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', booking_id uuid REFERENCES meeting_room_bookings(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_room_preview_expiry ON meeting_room_previews(expires_at);
