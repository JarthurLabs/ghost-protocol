CREATE TABLE gp_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  engine_json TEXT NOT NULL,
  engine_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_tick_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX gp_sessions_expiry ON gp_sessions(expires_at);
