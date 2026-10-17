ALTER TABLE meeting_rooms
ADD COLUMN deleted_at timestamptz;

ALTER TABLE meeting_room_bookings
ADD COLUMN removed_at timestamptz;

ALTER TABLE meeting_rooms
DROP CONSTRAINT meeting_rooms_name_location_key;

CREATE UNIQUE INDEX meeting_rooms_current_name_location ON meeting_rooms (name, location)
WHERE
    deleted_at IS NULL;