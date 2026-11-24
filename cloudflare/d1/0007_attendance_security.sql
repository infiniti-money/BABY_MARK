-- Additive only. No resource creation or data deletion outside this database.
ALTER TABLE attendances ADD COLUMN photo_sha256 TEXT;
ALTER TABLE attendances ADD COLUMN photo_source TEXT NOT NULL DEFAULT 'LEGACY_UNVERIFIED';
ALTER TABLE attendances ADD COLUMN received_at INTEGER;
ALTER TABLE attendances ADD COLUMN stamp_issued_at INTEGER;
ALTER TABLE attendances ADD COLUMN metadata_json TEXT;
CREATE TABLE attendance_challenges (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 assignment_id TEXT NOT NULL REFERENCES assignments(id),
 type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','PROCESSING','COMPLETED','FAILED')),
 metadata_json TEXT NOT NULL, plan_hash TEXT NOT NULL,
 photo_sha256 TEXT, attendance_id TEXT,
 UNIQUE(attendance_id)
);
CREATE INDEX challenge_user_time ON attendance_challenges(user_id,created_at);
CREATE INDEX challenge_assignment ON attendance_challenges(assignment_id,type,state);
CREATE UNIQUE INDEX challenge_processing ON attendance_challenges(assignment_id,type) WHERE state='PROCESSING';
CREATE TRIGGER assignment_no_edit_with_challenge BEFORE UPDATE ON assignments
 WHEN EXISTS(SELECT 1 FROM attendance_challenges WHERE assignment_id=OLD.id AND state='PROCESSING')
 BEGIN SELECT RAISE(ABORT,'ATTENDANCE_PROCESSING'); END;
