-- Fixed retail staffing; does not modify any existing assignments or shifts.
CREATE TABLE branch_rosters (
 branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
 morning_user_id TEXT NOT NULL REFERENCES profiles(id),
 evening_user_id TEXT NOT NULL REFERENCES profiles(id),
 morning_shift_id TEXT NOT NULL REFERENCES shifts(id),
 evening_shift_id TEXT NOT NULL REFERENCES shifts(id),
 handover TEXT NOT NULL CHECK(handover IN ('morning_stays','evening_arrives','split')),
 updated_at INTEGER NOT NULL,
 CHECK(morning_user_id<>evening_user_id),
 CHECK(morning_shift_id<>evening_shift_id)
);
CREATE UNIQUE INDEX roster_morning_user ON branch_rosters(morning_user_id);
CREATE UNIQUE INDEX roster_evening_user ON branch_rosters(evening_user_id);
CREATE TRIGGER roster_no_cross_branch_insert BEFORE INSERT ON branch_rosters
WHEN EXISTS(SELECT 1 FROM branch_rosters WHERE branch_id<>NEW.branch_id AND (morning_user_id IN (NEW.morning_user_id,NEW.evening_user_id) OR evening_user_id IN (NEW.morning_user_id,NEW.evening_user_id)))
BEGIN SELECT RAISE(ABORT,'ROSTER_EMPLOYEE_ALREADY_ASSIGNED'); END;
CREATE TRIGGER roster_no_cross_branch_update BEFORE UPDATE ON branch_rosters
WHEN EXISTS(SELECT 1 FROM branch_rosters WHERE branch_id<>OLD.branch_id AND (morning_user_id IN (NEW.morning_user_id,NEW.evening_user_id) OR evening_user_id IN (NEW.morning_user_id,NEW.evening_user_id)))
BEGIN SELECT RAISE(ABORT,'ROSTER_EMPLOYEE_ALREADY_ASSIGNED'); END;
