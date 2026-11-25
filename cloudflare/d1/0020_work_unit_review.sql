-- Append-only decisions, independent of attendance retention. No modification of original records.
CREATE TABLE work_unit_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,assignment_id TEXT NOT NULL,evidence TEXT NOT NULL,
 units REAL NOT NULL CHECK(units IN (0,0.5,1,1.5,2)),reason TEXT NOT NULL CHECK(length(trim(reason))>=5 AND length(reason)<=500),
 reviewed_by TEXT NOT NULL REFERENCES profiles(id),reviewed_at INTEGER NOT NULL
);
CREATE INDEX work_unit_reviews_assignment ON work_unit_reviews(assignment_id,id);
CREATE TRIGGER work_unit_reviews_immutable_update BEFORE UPDATE ON work_unit_reviews BEGIN SELECT RAISE(ABORT,'WORK_UNIT_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER work_unit_reviews_immutable_delete BEFORE DELETE ON work_unit_reviews BEGIN SELECT RAISE(ABORT,'WORK_UNIT_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER payroll_epoch_work_unit_reviews_insert AFTER INSERT ON work_unit_reviews BEGIN UPDATE payroll_epoch SET version=version+1 WHERE id=1; END;
