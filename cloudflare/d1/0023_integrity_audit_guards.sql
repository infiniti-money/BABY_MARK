-- Defense-in-depth invariants for direct D1/Worker writes.
-- These triggers do not replace authorization checks at the HTTP boundary.
CREATE TRIGGER IF NOT EXISTS attendance_assignment_user_guard_insert
BEFORE INSERT ON attendances
WHEN (SELECT user_id FROM assignments WHERE id=NEW.assignment_id) IS NULL
  OR (SELECT user_id FROM assignments WHERE id=NEW.assignment_id)<>NEW.user_id
BEGIN
 SELECT RAISE(ABORT,'attendance user does not match assignment');
END;

CREATE TRIGGER IF NOT EXISTS attendance_assignment_user_guard_update
BEFORE UPDATE OF assignment_id,user_id ON attendances
WHEN (SELECT user_id FROM assignments WHERE id=NEW.assignment_id) IS NULL
  OR (SELECT user_id FROM assignments WHERE id=NEW.assignment_id)<>NEW.user_id
BEGIN
 SELECT RAISE(ABORT,'attendance user does not match assignment');
END;

CREATE TRIGGER IF NOT EXISTS auth_audit_append_only_update
BEFORE UPDATE ON auth_audit
BEGIN
 SELECT RAISE(ABORT,'auth_audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS auth_audit_append_only_delete
BEFORE DELETE ON auth_audit
BEGIN
 SELECT RAISE(ABORT,'auth_audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS management_audit_append_only_update
BEFORE UPDATE ON management_audit
BEGIN
 SELECT RAISE(ABORT,'management_audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS management_audit_append_only_delete
BEFORE DELETE ON management_audit
BEGIN
 SELECT RAISE(ABORT,'management_audit is append-only');
END;
