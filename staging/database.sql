CREATE TABLE IF NOT EXISTS staging_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO staging_meta(key,value) VALUES('environment','ourhouse-staging-v1');
CREATE TABLE IF NOT EXISTS staging_blobs(key TEXT PRIMARY KEY,data TEXT NOT NULL);
