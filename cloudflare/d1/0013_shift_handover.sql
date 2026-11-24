-- Optional notes attached to a completed checkout. Existing attendance is unchanged.
CREATE TABLE shift_handover (
 assignment_id TEXT PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
 message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 1000),
 created_at INTEGER NOT NULL
);
CREATE INDEX shift_handover_created ON shift_handover(created_at);
