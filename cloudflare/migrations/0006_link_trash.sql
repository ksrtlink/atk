-- Keep short addresses reserved so printed QR codes can never be reassigned.
ALTER TABLE links ADD COLUMN deleted_at TEXT;
CREATE INDEX links_workspace_deleted ON links(workspace_id, deleted_at, created_at);
