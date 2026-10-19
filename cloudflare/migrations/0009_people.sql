CREATE TABLE people (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), slug TEXT NOT NULL UNIQUE,
 qr_id TEXT NOT NULL UNIQUE, assigned_uid TEXT REFERENCES users(uid), editable_json TEXT NOT NULL DEFAULT '[]',
 draft_json TEXT NOT NULL, published_json TEXT, state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','disabled')),
 version INTEGER NOT NULL DEFAULT 1, mutation_id TEXT NOT NULL, first_published_at TEXT, published_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(uid), updated_by TEXT NOT NULL REFERENCES users(uid),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX people_workspace ON people(workspace_id,updated_at);
CREATE INDEX people_assignment ON people(workspace_id,assigned_uid);
CREATE TABLE people_revisions (
 profile_id TEXT NOT NULL REFERENCES people(id), version INTEGER NOT NULL, content_json TEXT NOT NULL,
 action TEXT NOT NULL, actor_uid TEXT NOT NULL REFERENCES users(uid),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(profile_id,version)
);
CREATE TABLE people_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), profile_id TEXT NOT NULL REFERENCES people(id),
 kind TEXT NOT NULL CHECK(kind IN ('profile_view','contact_download','profile_action','profile_qr_visit')),
 action_id TEXT, occurred_at INTEGER NOT NULL, filter_version TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX people_events_workspace ON people_events(workspace_id,profile_id,occurred_at);
CREATE INDEX people_events_retention ON people_events(occurred_at);
