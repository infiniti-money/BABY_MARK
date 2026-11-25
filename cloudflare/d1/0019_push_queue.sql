-- Durable bounded dispatch queue, no automatic deletion or retry of uncertain sends.
CREATE TABLE push_queue (
 event_key TEXT NOT NULL,endpoint TEXT NOT NULL,user_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','accepted','failed','expired')),
 PRIMARY KEY(event_key,endpoint)
);
CREATE INDEX push_queue_pending ON push_queue(state,expires_at,created_at);
