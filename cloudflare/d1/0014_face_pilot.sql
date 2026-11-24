-- Opt-in only. No biometric images, embeddings or templates in D1.
CREATE TABLE face_pilot (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 enabled_at INTEGER NOT NULL,
 enabled_by TEXT NOT NULL REFERENCES profiles(id)
);
CREATE TABLE face_sessions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER
);
CREATE INDEX face_sessions_user_time ON face_sessions(user_id,created_at);
CREATE TABLE face_exception_reviews (
 attendance_id TEXT PRIMARY KEY REFERENCES attendances(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('APPROVED','REJECTED')),
 decided_by TEXT NOT NULL REFERENCES profiles(id),
 decided_at INTEGER NOT NULL,
 note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 5 AND 500)
);
