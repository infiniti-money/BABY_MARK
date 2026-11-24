-- D1 migration candidate, separate from PostgreSQL. Never apply to a production database without verification.
PRAGMA foreign_keys=ON;
CREATE TABLE profiles (
 id TEXT PRIMARY KEY, employee_code TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','manager','staff')),
 department TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);
CREATE TABLE branches (
 id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL UNIQUE,
 latitude REAL CHECK(latitude BETWEEN -90 AND 90), longitude REAL CHECK(longitude BETWEEN -180 AND 180),
 allowed_radius INTEGER NOT NULL DEFAULT 100 CHECK(allowed_radius BETWEEN 20 AND 1000),
 CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE TABLE shifts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
 grace_period INTEGER NOT NULL DEFAULT 0 CHECK(grace_period BETWEEN 0 AND 120)
);
CREATE TABLE branch_managers(user_id TEXT NOT NULL REFERENCES profiles(id),branch_id TEXT NOT NULL REFERENCES branches(id),PRIMARY KEY(user_id,branch_id));
CREATE TABLE assignments (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id), branch_id TEXT NOT NULL REFERENCES branches(id),
 shift_id TEXT NOT NULL REFERENCES shifts(id), work_date TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
 grace_minutes INTEGER NOT NULL DEFAULT 0 CHECK(grace_minutes BETWEEN 0 AND 120),
 CHECK(ends_at>starts_at AND ends_at-starts_at<=86400000),UNIQUE(user_id,starts_at)
);
CREATE INDEX assignment_user_date ON assignments(user_id,work_date);
CREATE INDEX assignment_branch_date ON assignments(branch_id,work_date);
CREATE TABLE attendances (
 id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES assignments(id),user_id TEXT NOT NULL REFERENCES profiles(id),
 type TEXT NOT NULL CHECK(type IN ('IN','OUT')),server_timestamp INTEGER NOT NULL,
 gps_lat REAL NOT NULL CHECK(gps_lat BETWEEN -90 AND 90),gps_lng REAL NOT NULL CHECK(gps_lng BETWEEN -180 AND 180),
 accuracy_m REAL NOT NULL CHECK(accuracy_m BETWEEN 0 AND 50),distance_m REAL NOT NULL CHECK(distance_m>=0),
 address_text TEXT NOT NULL DEFAULT '',photo_path TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('ON_TIME','LATE','EARLY','OUTSIDE')),
 late_minutes INTEGER NOT NULL DEFAULT 0 CHECK(late_minutes>=0),early_minutes INTEGER NOT NULL DEFAULT 0 CHECK(early_minutes>=0),
 UNIQUE(assignment_id,type)
);
CREATE INDEX attendance_user_time ON attendances(user_id,server_timestamp);
CREATE TABLE workforce_requests (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id),user_id TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('LEAVE','CORRECTION')),reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),
 proposed_in INTEGER,proposed_out INTEGER,state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),
 created_at INTEGER NOT NULL,decided_by TEXT REFERENCES profiles(id),decided_at INTEGER,decision_note TEXT,
 CHECK((kind='LEAVE' AND proposed_in IS NULL AND proposed_out IS NULL) OR (kind='CORRECTION' AND proposed_in IS NOT NULL AND proposed_out IS NOT NULL AND proposed_out>proposed_in)),
 CHECK((state='PENDING' AND decided_by IS NULL AND decided_at IS NULL) OR (state<>'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX request_active ON workforce_requests(assignment_id) WHERE state IN ('PENDING','APPROVED');
CREATE TABLE attendance_notifications (
 id TEXT PRIMARY KEY,recipient_id TEXT NOT NULL REFERENCES profiles(id),assignment_id TEXT NOT NULL REFERENCES assignments(id),
 kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(recipient_id,assignment_id,kind)
);
CREATE INDEX notification_recipient_time ON attendance_notifications(recipient_id,created_at);
CREATE TABLE push_devices(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),updated_at INTEGER NOT NULL);
CREATE TABLE push_deliveries (
 id TEXT PRIMARY KEY, notification_id TEXT NOT NULL REFERENCES attendance_notifications(id),token TEXT NOT NULL REFERENCES push_devices(token) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed')),updated_at INTEGER NOT NULL,ticket_id TEXT,UNIQUE(notification_id,token)
);
-- UTC epoch milliseconds for timestamps; work_date remains Vietnam local YYYY-MM-DD.
-- No public database endpoint; access must be checked in every Worker query (D1 has no PostgreSQL RLS).
