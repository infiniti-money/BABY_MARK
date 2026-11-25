-- Additive migration. No historical records are rewritten, and no dates are inferred.
CREATE TABLE employment_periods (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),start_date TEXT NOT NULL,end_date TEXT,
 recorded_by TEXT NOT NULL REFERENCES profiles(id),created_at INTEGER NOT NULL,
 CHECK(length(start_date)=10 AND (end_date IS NULL OR (length(end_date)=10 AND end_date>=start_date)))
);
CREATE INDEX employment_periods_user ON employment_periods(user_id,start_date);
CREATE TRIGGER employment_periods_overlap_insert BEFORE INSERT ON employment_periods
WHEN EXISTS(SELECT 1 FROM employment_periods p WHERE p.user_id=NEW.user_id AND p.start_date<=COALESCE(NEW.end_date,'9999-12-31') AND NEW.start_date<=COALESCE(p.end_date,'9999-12-31'))
BEGIN SELECT RAISE(ABORT,'EMPLOYMENT_PERIOD_OVERLAP'); END;
CREATE TRIGGER employment_periods_overlap_update BEFORE UPDATE ON employment_periods
WHEN EXISTS(SELECT 1 FROM employment_periods p WHERE p.user_id=NEW.user_id AND p.id<>OLD.id AND p.start_date<=COALESCE(NEW.end_date,'9999-12-31') AND NEW.start_date<=COALESCE(p.end_date,'9999-12-31'))
BEGIN SELECT RAISE(ABORT,'EMPLOYMENT_PERIOD_OVERLAP'); END;
CREATE TABLE payroll_epoch(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version>=0));
INSERT INTO payroll_epoch VALUES(1,0);
CREATE TRIGGER payroll_epoch_profiles_insert AFTER INSERT ON profiles BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_profiles_update AFTER UPDATE ON profiles BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_profiles_delete AFTER DELETE ON profiles BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_branches_insert AFTER INSERT ON branches BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_branches_update AFTER UPDATE ON branches BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_branches_delete AFTER DELETE ON branches BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_shifts_insert AFTER INSERT ON shifts BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_shifts_update AFTER UPDATE ON shifts BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_shifts_delete AFTER DELETE ON shifts BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_assignments_insert AFTER INSERT ON assignments BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_assignments_update AFTER UPDATE ON assignments BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_assignments_delete AFTER DELETE ON assignments BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_attendances_insert AFTER INSERT ON attendances BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_attendances_update AFTER UPDATE ON attendances BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_attendances_delete AFTER DELETE ON attendances BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_workforce_requests_insert AFTER INSERT ON workforce_requests BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_workforce_requests_update AFTER UPDATE ON workforce_requests BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_workforce_requests_delete AFTER DELETE ON workforce_requests BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_extra_attendance_insert AFTER INSERT ON extra_attendance BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_extra_attendance_update AFTER UPDATE ON extra_attendance BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_extra_attendance_delete AFTER DELETE ON extra_attendance BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_payroll_inputs_insert AFTER INSERT ON payroll_inputs BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_payroll_inputs_update AFTER UPDATE ON payroll_inputs BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_payroll_inputs_delete AFTER DELETE ON payroll_inputs BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_payroll_components_insert AFTER INSERT ON payroll_components BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_payroll_components_update AFTER UPDATE ON payroll_components BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_payroll_components_delete AFTER DELETE ON payroll_components BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_employment_periods_insert AFTER INSERT ON employment_periods BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_employment_periods_update AFTER UPDATE ON employment_periods BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
CREATE TRIGGER payroll_epoch_employment_periods_delete AFTER DELETE ON employment_periods BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
