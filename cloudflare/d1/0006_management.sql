-- Additive management migration. Does not alter or delete existing attendance.
ALTER TABLE branches ADD COLUMN address_text TEXT NOT NULL DEFAULT '';
CREATE TABLE management_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES profiles(id),
 resource TEXT NOT NULL, resource_id TEXT NOT NULL, action TEXT NOT NULL,
 details_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX management_audit_time ON management_audit(created_at,id);
CREATE INDEX assignment_user_interval ON assignments(user_id,starts_at,ends_at);
CREATE INDEX request_user_created ON workforce_requests(user_id,created_at);

-- SQLite serializes writes, so these guards also prevent concurrent overlapping
-- schedules and leave/attendance approval races; application reads alone cannot.
CREATE TRIGGER assignments_no_overlap_insert BEFORE INSERT ON assignments
WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.user_id=NEW.user_id AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at)
BEGIN SELECT RAISE(ABORT,'ASSIGNMENT_OVERLAP'); END;
CREATE TRIGGER assignments_no_overlap_update BEFORE UPDATE ON assignments
WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.user_id=NEW.user_id AND a.id<>OLD.id AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at)
BEGIN SELECT RAISE(ABORT,'ASSIGNMENT_OVERLAP'); END;
CREATE TRIGGER assignments_preserve_history BEFORE UPDATE ON assignments
WHEN EXISTS(SELECT 1 FROM attendances WHERE assignment_id=OLD.id) OR EXISTS(SELECT 1 FROM workforce_requests WHERE assignment_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'ASSIGNMENT_HAS_HISTORY'); END;
CREATE TRIGGER attendance_no_approved_leave BEFORE INSERT ON attendances
WHEN EXISTS(SELECT 1 FROM workforce_requests WHERE assignment_id=NEW.assignment_id AND kind='LEAVE' AND state='APPROVED')
BEGIN SELECT RAISE(ABORT,'APPROVED_LEAVE'); END;
CREATE TRIGGER leave_no_attendance BEFORE UPDATE OF state ON workforce_requests
WHEN NEW.kind='LEAVE' AND NEW.state='APPROVED' AND EXISTS(SELECT 1 FROM attendances WHERE assignment_id=NEW.assignment_id)
BEGIN SELECT RAISE(ABORT,'ALREADY_ATTENDED'); END;
