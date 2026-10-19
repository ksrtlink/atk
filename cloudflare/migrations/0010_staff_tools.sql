CREATE TABLE people_templates (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), content_json TEXT NOT NULL, editable_json TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL REFERENCES users(uid),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE people_imports (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), rows_json TEXT NOT NULL, request_json TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(uid), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX people_imports_workspace ON people_imports(workspace_id,created_at);
ALTER TABLE people ADD COLUMN source_import_id TEXT REFERENCES people_imports(id);
CREATE TABLE people_import_rows (
 import_id TEXT NOT NULL REFERENCES people_imports(id), row_index INTEGER NOT NULL,
 profile_id TEXT REFERENCES people(id), status TEXT NOT NULL CHECK(status IN ('created','error')),
 error TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(import_id,row_index)
);
