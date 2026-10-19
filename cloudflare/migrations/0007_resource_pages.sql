CREATE TABLE resource_pages (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 slug TEXT NOT NULL UNIQUE,
 draft_json TEXT NOT NULL,
 published_json TEXT,
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','archived')),
 first_published_at TEXT,
 published_at TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 mutation_id TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(uid),
 updated_by TEXT NOT NULL REFERENCES users(uid),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX resources_workspace_updated ON resource_pages(workspace_id,updated_at);
CREATE TABLE resource_revisions (
 resource_id TEXT NOT NULL REFERENCES resource_pages(id),
 version INTEGER NOT NULL,
 content_json TEXT NOT NULL,
 action TEXT NOT NULL,
 actor_uid TEXT NOT NULL REFERENCES users(uid),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(resource_id,version)
);
CREATE TABLE resource_events (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 resource_id TEXT NOT NULL REFERENCES resource_pages(id),
 item_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('page_view','resource_click')),
 occurred_at INTEGER NOT NULL,
 filter_version TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX resource_events_workspace_time ON resource_events(workspace_id,occurred_at);
CREATE INDEX resource_events_page_time ON resource_events(workspace_id,resource_id,occurred_at);
CREATE INDEX resource_events_retention ON resource_events(occurred_at);
