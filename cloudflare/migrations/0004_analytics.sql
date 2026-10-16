CREATE TABLE analytics_settings (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 tracking_since INTEGER,
 updated_at INTEGER NOT NULL
);
CREATE TABLE analytics_periods (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 started_at INTEGER NOT NULL,
 ended_at INTEGER,
 CHECK(ended_at IS NULL OR ended_at>=started_at)
);
CREATE UNIQUE INDEX analytics_one_open_period ON analytics_periods(workspace_id) WHERE ended_at IS NULL;
CREATE INDEX analytics_periods_workspace ON analytics_periods(workspace_id,started_at);
CREATE TABLE tracked_qrs (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 title TEXT NOT NULL,
 public_url TEXT NOT NULL UNIQUE,
 link_slug TEXT REFERENCES links(slug),
 destination TEXT,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','disabled')),
 version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(uid),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((link_slug IS NOT NULL AND destination IS NULL) OR (link_slug IS NULL AND destination IS NOT NULL))
);
CREATE INDEX tracked_qrs_workspace ON tracked_qrs(workspace_id,created_at);
ALTER TABLE qr_designs ADD COLUMN tracked_qr_id TEXT REFERENCES tracked_qrs(id);
CREATE INDEX qr_designs_tracked ON qr_designs(tracked_qr_id);
ALTER TABLE bulk_jobs ADD COLUMN tracked INTEGER NOT NULL DEFAULT 0 CHECK(tracked IN (0,1));
CREATE TABLE engagement_events (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 asset_type TEXT NOT NULL CHECK(asset_type IN ('link','qr')),
 asset_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('link_visit','qr_visit')),
 occurred_at INTEGER NOT NULL,
 country TEXT NOT NULL,
 device TEXT NOT NULL,
 browser TEXT NOT NULL,
 os TEXT NOT NULL,
 referrer_host TEXT NOT NULL,
 filter_version TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX events_workspace_time ON engagement_events(workspace_id,occurred_at);
CREATE INDEX events_asset_time ON engagement_events(workspace_id,asset_type,asset_id,occurred_at);
CREATE INDEX events_retention ON engagement_events(occurred_at);
