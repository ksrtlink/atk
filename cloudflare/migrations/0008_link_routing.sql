CREATE TABLE link_routing (
 slug TEXT PRIMARY KEY REFERENCES links(slug),
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 config_json TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 mutation_id TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES users(uid),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX link_routing_workspace ON link_routing(workspace_id);
CREATE TABLE link_routing_revisions (
 slug TEXT NOT NULL REFERENCES links(slug),
 version INTEGER NOT NULL,
 config_json TEXT NOT NULL,
 actor_uid TEXT NOT NULL REFERENCES users(uid),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(slug,version)
);
