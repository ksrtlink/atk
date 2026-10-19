CREATE TABLE audit_policy (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),pauses INTEGER NOT NULL DEFAULT 0,last_paused_at INTEGER,started_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)));
INSERT INTO audit_policy(id) VALUES(1);
CREATE TRIGGER audit_policy_pause AFTER UPDATE OF enabled ON audit_policy WHEN NEW.enabled=0 AND OLD.enabled=1 BEGIN
 UPDATE audit_policy SET pauses=pauses+1,last_paused_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
CREATE TABLE audit_records (
 id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 actor_uid TEXT, actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','visitor','system')),
 action TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, subject_version INTEGER,
 occurred_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
);
CREATE INDEX audit_workspace_time ON audit_records(workspace_id,occurred_at DESC,id DESC);
CREATE INDEX audit_workspace_type_time ON audit_records(workspace_id,subject_type,occurred_at DESC,id DESC);
CREATE INDEX audit_retention ON audit_records(occurred_at);
ALTER TABLE tracked_qrs ADD COLUMN updated_by TEXT;
ALTER TABLE analytics_settings ADD COLUMN updated_by TEXT;
ALTER TABLE contact_campaigns ADD COLUMN updated_by TEXT;
ALTER TABLE contact_submissions ADD COLUMN updated_by TEXT;

CREATE TRIGGER audit_link_create AFTER INSERT ON links WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.workspace_id IS NOT NULL AND NEW.legacy=0) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,'link.created','link',NEW.slug,NEW.version);
END;

CREATE TRIGGER audit_link_update AFTER UPDATE ON links WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.workspace_id IS NOT NULL AND NEW.legacy=0 AND (NEW.version<>OLD.version OR NEW.workspace_id IS NOT OLD.workspace_id)) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.workspace_id IS NOT OLD.workspace_id THEN 'link.transferred' WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'link.deleted' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'link.restored' ELSE 'link.updated' END,'link',NEW.slug,NEW.version);
END;

CREATE TRIGGER audit_design_create AFTER INSERT ON qr_designs WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.workspace_id IS NOT NULL) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,'design.created','design',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_design_update AFTER UPDATE ON qr_designs WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.workspace_id IS NOT NULL AND (NEW.version<>OLD.version OR NEW.workspace_id IS NOT OLD.workspace_id)) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.workspace_id IS NOT OLD.workspace_id THEN 'design.transferred' ELSE 'design.updated' END,'design',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_qr_create AFTER INSERT ON tracked_qrs WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.created_by,CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'user' END,'qr.created','qr',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_qr_update AFTER UPDATE ON tracked_qrs WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.version<>OLD.version) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.state<>OLD.state THEN CASE WHEN NEW.state='disabled' THEN 'qr.disabled' ELSE 'qr.activated' END ELSE 'qr.updated' END,'qr',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_profile_revision AFTER INSERT ON people_revisions WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES((SELECT workspace_id FROM people WHERE id=NEW.profile_id),NEW.actor_uid,CASE WHEN NEW.actor_uid IS NULL THEN 'system' ELSE 'user' END,'profile.'||CASE WHEN NEW.action IN ('created','saved','published','unpublished','disabled','activated','assigned','photo_updated') THEN NEW.action ELSE 'updated' END,'profile',NEW.profile_id,NEW.version);
END;

CREATE TRIGGER audit_resource_revision AFTER INSERT ON resource_revisions WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES((SELECT workspace_id FROM resource_pages WHERE id=NEW.resource_id),NEW.actor_uid,CASE WHEN NEW.actor_uid IS NULL THEN 'system' ELSE 'user' END,'resource.'||CASE WHEN NEW.action IN ('created','saved','published','unpublished','archived','restored','revision_restored') THEN NEW.action ELSE 'updated' END,'resource',NEW.resource_id,NEW.version);
END;

CREATE TRIGGER audit_routing_revision AFTER INSERT ON link_routing_revisions WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES((SELECT workspace_id FROM links WHERE slug=NEW.slug),NEW.actor_uid,CASE WHEN NEW.actor_uid IS NULL THEN 'system' ELSE 'user' END,'routing.saved','routing',NEW.slug,NEW.version);
END;

CREATE TRIGGER audit_template_insert AFTER INSERT ON people_templates WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,'template.saved','template',NEW.workspace_id,NEW.version);
END;

CREATE TRIGGER audit_template_update AFTER UPDATE ON people_templates WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.version<>OLD.version) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,'template.saved','template',NEW.workspace_id,NEW.version);
END;

CREATE TRIGGER audit_preset_create AFTER INSERT ON presets WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.created_by,CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'user' END,'preset.created','preset',NEW.id,NULL);
END;

CREATE TRIGGER audit_bulk_create AFTER INSERT ON bulk_jobs WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.created_by,CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'user' END,'bulk.started','bulk',NEW.id,NULL);
END;

CREATE TRIGGER audit_staff_import_create AFTER INSERT ON people_imports WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.created_by,CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'user' END,'staff_import.started','staff_import',NEW.id,NULL);
END;

CREATE TRIGGER audit_analytics_insert AFTER INSERT ON analytics_settings WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.enabled=1) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.enabled=1 THEN 'analytics.enabled' ELSE 'analytics.disabled' END,'analytics',NEW.workspace_id,NULL);
END;

CREATE TRIGGER audit_contact_setting_insert AFTER INSERT ON contact_settings WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES((SELECT workspace_id FROM people WHERE id=NEW.profile_id),NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.enabled=1 THEN 'contact_settings.enabled' ELSE 'contact_settings.disabled' END,'contact_settings',NEW.profile_id,NEW.version);
END;

CREATE TRIGGER audit_analytics_update AFTER UPDATE ON analytics_settings WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.enabled<>OLD.enabled) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.enabled=1 THEN 'analytics.enabled' ELSE 'analytics.disabled' END,'analytics',NEW.workspace_id,NULL);
END;

CREATE TRIGGER audit_contact_setting_update AFTER UPDATE ON contact_settings WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.enabled<>OLD.enabled) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES((SELECT workspace_id FROM people WHERE id=NEW.profile_id),NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.enabled=1 THEN 'contact_settings.enabled' ELSE 'contact_settings.disabled' END,'contact_settings',NEW.profile_id,NEW.version);
END;

CREATE TRIGGER audit_event_create AFTER INSERT ON contact_campaigns WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.created_by,CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'user' END,'event.created','event',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_event_update AFTER UPDATE ON contact_campaigns WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.active<>OLD.active) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.active=1 THEN 'event.enabled' ELSE 'event.disabled' END,'event',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_contact_create AFTER INSERT ON contact_submissions WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NULL,'visitor','contact.received','contact',NEW.id,NEW.version);
END;

CREATE TRIGGER audit_contact_update AFTER UPDATE ON contact_submissions WHEN (SELECT enabled FROM audit_policy WHERE id=1)=1 AND (NEW.state<>OLD.state) BEGIN
 INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,subject_version) VALUES(NEW.workspace_id,NEW.updated_by,CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,CASE WHEN NEW.state='reviewed' THEN 'contact.reviewed' ELSE 'contact.marked_new' END,'contact',NEW.id,NEW.version);
END;
