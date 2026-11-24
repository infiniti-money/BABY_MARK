-- Web Push is opt-in. No production data removed. Run after 0009.
CREATE TABLE web_push_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 reminders INTEGER NOT NULL DEFAULT 1 CHECK(reminders IN (0,1)),
 late_alerts INTEGER NOT NULL DEFAULT 1 CHECK(late_alerts IN (0,1))
);
INSERT INTO web_push_settings(id) VALUES(1);
CREATE TABLE web_push_subscriptions (
 endpoint TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_test_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX web_push_user ON web_push_subscriptions(user_id);
-- Deliberately independent of assignment FK: retention must not be blocked.
-- Claim before sending; an uncertain network outcome is not automatically retried.
CREATE TABLE web_push_receipts (
 event_key TEXT NOT NULL,
 endpoint TEXT NOT NULL,
 claimed_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('claimed','accepted','failed')),
 PRIMARY KEY(event_key,endpoint)
);
CREATE INDEX web_push_receipts_age ON web_push_receipts(claimed_at);
CREATE INDEX web_push_assignment_start ON assignments(starts_at);
