-- Apply after 0004. No existing records deleted by this migration.
CREATE INDEX assignment_end_retention ON assignments(ends_at,id);
CREATE INDEX workforce_assignment_retention ON workforce_requests(assignment_id,state,decided_at);
CREATE INDEX notification_assignment_retention ON attendance_notifications(assignment_id);
CREATE INDEX delivery_notification_retention ON push_deliveries(notification_id);
CREATE TABLE retention_runs (
 id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, cutoff_at INTEGER NOT NULL,
 assignments_removed INTEGER NOT NULL DEFAULT 0
);
-- Temporary work list, populated and emptied within one atomic D1 batch.
CREATE TABLE retention_candidates (
 run_id TEXT NOT NULL REFERENCES retention_runs(id), assignment_id TEXT NOT NULL,
 PRIMARY KEY(run_id,assignment_id)
);
