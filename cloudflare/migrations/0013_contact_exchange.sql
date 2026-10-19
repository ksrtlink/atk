CREATE TABLE contact_settings (
 profile_id TEXT PRIMARY KEY REFERENCES people(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 first_enabled_at INTEGER, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL REFERENCES users(uid), updated_at INTEGER NOT NULL
);
CREATE TABLE contact_campaigns (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES people(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(uid), created_at INTEGER NOT NULL, UNIQUE(profile_id,id)
);
CREATE INDEX contact_campaigns_profile ON contact_campaigns(workspace_id,profile_id,created_at);
CREATE TABLE contact_receipts (id TEXT PRIMARY KEY, mutation_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX contact_receipts_expiry ON contact_receipts(expires_at);
CREATE TABLE contact_abuse_buckets (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX contact_abuse_expiry ON contact_abuse_buckets(expires_at);
CREATE TABLE contact_submissions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), profile_id TEXT NOT NULL REFERENCES people(id),
 campaign_id TEXT, campaign_name TEXT, fields_json TEXT NOT NULL, consent_version TEXT NOT NULL, consent_text TEXT NOT NULL,
 consent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'new' CHECK(state IN ('new','reviewed')),
 version INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(profile_id,campaign_id) REFERENCES contact_campaigns(profile_id,id)
);
CREATE INDEX contact_submissions_inbox ON contact_submissions(workspace_id,profile_id,consent_at,id);
CREATE INDEX contact_submissions_expiry ON contact_submissions(expires_at);
CREATE TABLE contact_submission_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), profile_id TEXT NOT NULL REFERENCES people(id),
 campaign_id TEXT, occurred_at INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind='contact_submission')
);
CREATE INDEX contact_events_report ON contact_submission_events(workspace_id,profile_id,occurred_at);
CREATE INDEX contact_events_expiry ON contact_submission_events(occurred_at);
