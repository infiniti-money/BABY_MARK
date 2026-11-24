CREATE TABLE IF NOT EXISTS chat_threads (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('DIRECT','GROUP','SYSTEM')),
 title TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES profiles(id),
 created_at INTEGER NOT NULL,
 CHECK((kind='SYSTEM' AND id='system' AND created_by IS NULL) OR (kind<>'SYSTEM' AND id<>'system' AND created_by IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS chat_members (
 thread_id TEXT NOT NULL REFERENCES chat_threads(id),
 user_id TEXT NOT NULL REFERENCES profiles(id),
 PRIMARY KEY(thread_id,user_id)
);
CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members(user_id,thread_id);
CREATE TABLE IF NOT EXISTS chat_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 thread_id TEXT NOT NULL REFERENCES chat_threads(id),
 sender_id TEXT NOT NULL REFERENCES profiles(id),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages(thread_id,id);
CREATE INDEX IF NOT EXISTS chat_messages_sender ON chat_messages(sender_id,created_at);
CREATE TABLE IF NOT EXISTS chat_reads (
 thread_id TEXT NOT NULL REFERENCES chat_threads(id),
 user_id TEXT NOT NULL REFERENCES profiles(id),
 last_read_id INTEGER NOT NULL DEFAULT 0 CHECK(last_read_id>=0),
 PRIMARY KEY(thread_id,user_id)
);
INSERT OR IGNORE INTO chat_threads(id,kind,title,created_at) VALUES('system','SYSTEM','Thông báo hệ thống',0);
