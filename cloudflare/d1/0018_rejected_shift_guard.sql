-- Replace overlap guards without editing or deleting a single assignment.
-- Only rejected extras with NO attendance or processing evidence can be ignored.
DROP TRIGGER assignments_no_overlap_insert;
DROP TRIGGER assignments_no_overlap_update;
CREATE TRIGGER assignments_no_overlap_insert BEFORE INSERT ON assignments
WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.user_id=NEW.user_id AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at
 AND NOT (EXISTS(SELECT 1 FROM extra_attendance x WHERE x.assignment_id=a.id AND x.state='REJECTED')
 AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM attendance_challenges c WHERE c.assignment_id=a.id AND c.state='PROCESSING')))
BEGIN SELECT RAISE(ABORT,'ASSIGNMENT_OVERLAP'); END;
CREATE TRIGGER assignments_no_overlap_update BEFORE UPDATE ON assignments
WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.user_id=NEW.user_id AND a.id<>OLD.id AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at
 AND NOT (EXISTS(SELECT 1 FROM extra_attendance x WHERE x.assignment_id=a.id AND x.state='REJECTED')
 AND NOT EXISTS(SELECT 1 FROM attendances t WHERE t.assignment_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM attendance_challenges c WHERE c.assignment_id=a.id AND c.state='PROCESSING')))
BEGIN SELECT RAISE(ABORT,'ASSIGNMENT_OVERLAP'); END;
CREATE TRIGGER attendance_no_rejected_extra BEFORE INSERT ON attendances
WHEN EXISTS(SELECT 1 FROM extra_attendance x WHERE x.assignment_id=NEW.assignment_id AND x.state='REJECTED')
BEGIN SELECT RAISE(ABORT,'EXTRA_REJECTED'); END;
-- UNIQUE(user_id,starts_at) remains in force. Exact-start replacement requires a separately reviewed schema change.
