-- Apply once after 0003_internal_auth.sql. Inventory for private KV, not attendance history.
CREATE TABLE photo_inventory (
 photo_path TEXT PRIMARY KEY,
 byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 200000),
 captured_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','stored','evicting','evicted','expired')),
 removed_at INTEGER,
 removal_reason TEXT
);
CREATE INDEX photo_inventory_state_age ON photo_inventory(state,captured_at,photo_path);
CREATE INDEX photo_inventory_state_expiry ON photo_inventory(state,expires_at);
CREATE TABLE photo_storage_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT, acquired_at INTEGER);
INSERT INTO photo_storage_lock(id) VALUES(1);
