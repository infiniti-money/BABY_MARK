-- Local verification applies this only to ephemeral databases. Additive guards.
CREATE TRIGGER branches_capacity_insert BEFORE INSERT ON branches
 WHEN (SELECT COUNT(*) FROM branches)>=14
 BEGIN SELECT RAISE(ABORT,'BRANCH_CAPACITY_14'); END;
CREATE TRIGGER profiles_active_capacity_insert BEFORE INSERT ON profiles
 WHEN NEW.active=1 AND NEW.role<>'admin' AND (SELECT COUNT(*) FROM profiles WHERE active=1 AND role<>'admin')>=50
 BEGIN SELECT RAISE(ABORT,'EMPLOYEE_CAPACITY_50'); END;
CREATE TRIGGER profiles_active_capacity_update BEFORE UPDATE OF active,role ON profiles
 WHEN NEW.active=1 AND NEW.role<>'admin' AND (OLD.active<>1 OR OLD.role='admin')
 AND (SELECT COUNT(*) FROM profiles WHERE active=1 AND role<>'admin' AND id<>OLD.id)>=50
 BEGIN SELECT RAISE(ABORT,'EMPLOYEE_CAPACITY_50'); END;
CREATE TRIGGER branch_no_edit_with_challenge BEFORE UPDATE ON branches
 WHEN EXISTS(SELECT 1 FROM attendance_challenges c JOIN assignments a ON a.id=c.assignment_id WHERE a.branch_id=OLD.id AND c.state='PROCESSING')
 BEGIN SELECT RAISE(ABORT,'ATTENDANCE_PROCESSING'); END;
