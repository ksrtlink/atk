CREATE TABLE link_health (
 slug TEXT PRIMARY KEY REFERENCES links(slug), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), version INTEGER NOT NULL DEFAULT 1,
 link_version INTEGER NOT NULL DEFAULT 0, routing_version INTEGER NOT NULL DEFAULT 0, sync_token TEXT,
 last_requested INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL REFERENCES users(uid),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX health_workspace_enabled ON link_health(workspace_id,enabled);
CREATE TABLE link_health_targets (
 slug TEXT NOT NULL REFERENCES link_health(slug), target_id TEXT NOT NULL,
 destination TEXT NOT NULL, labels_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','healthy','broken','blocked','unreachable','unknown')),
 reason TEXT, http_status INTEGER, checked_at INTEGER, elapsed_ms INTEGER, redirects INTEGER,
 due_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(slug,target_id)
) WITHOUT ROWID;
CREATE INDEX health_targets_due ON link_health_targets(due_at,lease_until);
