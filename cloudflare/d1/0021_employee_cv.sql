-- Additive private employee CV. Separate from attendance/payroll and credentials.
CREATE TABLE IF NOT EXISTS employee_cv (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 data_json TEXT NOT NULL CHECK(json_valid(data_json) AND json_type(data_json)='object' AND length(CAST(data_json AS BLOB))<=24000),
 revision INTEGER NOT NULL CHECK(revision>=1),
 updated_by TEXT NOT NULL REFERENCES profiles(id),
 updated_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS employee_cv_audit_insert AFTER INSERT ON employee_cv
BEGIN
 INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.updated_by,'employee-cv',NEW.user_id,'CREATE',json_object('revision',NEW.revision),NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS employee_cv_audit_update AFTER UPDATE ON employee_cv
BEGIN
 INSERT INTO management_audit(id,actor_id,resource,resource_id,action,details_json,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.updated_by,'employee-cv',NEW.user_id,'UPDATE',json_object('revision',NEW.revision),NEW.updated_at);
END;
