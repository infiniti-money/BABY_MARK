-- Keep original scheduled assignments and attendance evidence unchanged.
CREATE TABLE extra_attendance (
 assignment_id TEXT PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('EXTRA','COVER')),
 replaced_name TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),
 created_at INTEGER NOT NULL,
 decided_by TEXT REFERENCES profiles(id),
 decided_at INTEGER,
 decision_note TEXT NOT NULL DEFAULT '',
 CHECK(kind<>'COVER' OR length(trim(replaced_name)) BETWEEN 1 AND 120),
 CHECK((state='PENDING' AND decided_by IS NULL AND decided_at IS NULL) OR (state<>'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX extra_attendance_state ON extra_attendance(state,created_at);
