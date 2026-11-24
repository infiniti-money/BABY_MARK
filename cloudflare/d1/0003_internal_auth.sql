-- D1 only, run once after initial schema and store catalog.
CREATE TABLE credentials (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 username TEXT NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 64),
 salt TEXT NOT NULL CHECK(length(salt)=32),
 secret_hash TEXT NOT NULL CHECK(length(secret_hash)=64),
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
 user_id TEXT NOT NULL REFERENCES profiles(id), credential_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id), window_id INTEGER NOT NULL, attempts INTEGER NOT NULL
);
CREATE TABLE auth_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES profiles(id),target_id TEXT NOT NULL REFERENCES profiles(id),
 action TEXT NOT NULL CHECK(action IN ('CREATE','RESET','DISABLE','ENABLE')), created_at INTEGER NOT NULL
);
CREATE INDEX auth_audit_target ON auth_audit(target_id,created_at);
