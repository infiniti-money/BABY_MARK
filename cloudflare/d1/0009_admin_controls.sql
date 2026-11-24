-- Apply once after 0008. Preserve existing stores, assignments, attendance and accounts.
ALTER TABLE branches ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
CREATE TABLE system_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 branch_limit INTEGER NOT NULL DEFAULT 14 CHECK(branch_limit BETWEEN 1 AND 50),
 photo_eviction INTEGER CHECK(photo_eviction IN (0,1)),
 attendance_retention INTEGER CHECK(attendance_retention IN (0,1)),
 late_alerts INTEGER NOT NULL DEFAULT 0 CHECK(late_alerts IN (0,1)),
 updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO system_settings(id) VALUES(1);
DROP TRIGGER branches_capacity_insert;
CREATE TRIGGER branches_capacity_insert BEFORE INSERT ON branches
 WHEN NEW.active=1 AND (SELECT COUNT(*) FROM branches WHERE active=1)>=(SELECT branch_limit FROM system_settings WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'BRANCH_CAPACITY'); END;
CREATE TRIGGER branches_capacity_reactivate BEFORE UPDATE OF active ON branches
 WHEN OLD.active=0 AND NEW.active=1 AND (SELECT COUNT(*) FROM branches WHERE active=1)>=(SELECT branch_limit FROM system_settings WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'BRANCH_CAPACITY'); END;
CREATE TRIGGER branch_limit_not_below_active BEFORE UPDATE OF branch_limit ON system_settings
 WHEN NEW.branch_limit<(SELECT COUNT(*) FROM branches WHERE active=1)
 BEGIN SELECT RAISE(ABORT,'BRANCH_LIMIT_BELOW_ACTIVE'); END;
CREATE TRIGGER branch_archive_requires_no_open_schedule BEFORE UPDATE OF active ON branches
 WHEN OLD.active=1 AND NEW.active=0 AND EXISTS(SELECT 1 FROM assignments WHERE branch_id=OLD.id AND ends_at>=unixepoch()*1000-43200000)
 BEGIN SELECT RAISE(ABORT,'BRANCH_HAS_OPEN_SCHEDULE'); END;
CREATE TRIGGER assignment_active_branch_insert BEFORE INSERT ON assignments
 WHEN EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND active=0)
 BEGIN SELECT RAISE(ABORT,'BRANCH_INACTIVE'); END;
CREATE TRIGGER assignment_active_branch_update BEFORE UPDATE OF branch_id,starts_at,ends_at ON assignments
 WHEN EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND active=0)
 BEGIN SELECT RAISE(ABORT,'BRANCH_INACTIVE'); END;
