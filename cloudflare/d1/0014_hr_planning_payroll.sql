-- Additive only: opt-in scheduler and immutable monthly closing revisions.
CREATE TABLE roster_automation (
 branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
 weekday_mask INTEGER NOT NULL CHECK(weekday_mask BETWEEN 1 AND 127),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_by TEXT NOT NULL REFERENCES profiles(id),
 updated_at INTEGER NOT NULL,
 last_run_at INTEGER,
 last_status TEXT NOT NULL DEFAULT ''
);
CREATE TABLE payroll_inputs (
 month TEXT NOT NULL CHECK(length(month)=7),
 user_id TEXT NOT NULL REFERENCES profiles(id),
 hourly_rate INTEGER NOT NULL CHECK(hourly_rate BETWEEN 0 AND 10000000),
 additions INTEGER NOT NULL DEFAULT 0 CHECK(additions BETWEEN 0 AND 1000000000),
 deductions INTEGER NOT NULL DEFAULT 0 CHECK(deductions BETWEEN 0 AND 1000000000),
 note TEXT NOT NULL DEFAULT '',
 updated_by TEXT NOT NULL REFERENCES profiles(id),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(month,user_id)
);
CREATE TABLE payroll_closings (
 month TEXT NOT NULL CHECK(length(month)=7),
 revision INTEGER NOT NULL CHECK(revision>=1),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 created_by TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 PRIMARY KEY(month,revision)
);
CREATE TRIGGER payroll_closings_immutable_update BEFORE UPDATE ON payroll_closings BEGIN SELECT RAISE(ABORT,'PAYROLL_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER payroll_closings_immutable_delete BEFORE DELETE ON payroll_closings BEGIN SELECT RAISE(ABORT,'PAYROLL_SNAPSHOT_IMMUTABLE'); END;
