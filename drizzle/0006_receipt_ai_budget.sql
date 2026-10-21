-- Technical usage counters only. No receipt images, text or account IDs.
CREATE TABLE IF NOT EXISTS receipt_ai_budget (
 scope TEXT PRIMARY KEY,
 day INTEGER NOT NULL,
 calls INTEGER NOT NULL DEFAULT 0
);
