-- Synthetic records for isolated staging/local D1 only. Never apply to production.
INSERT OR IGNORE INTO users(uid,email,display_name) VALUES('r1-stage-owner','release1@example.test','Release 1 runtime test');
INSERT OR IGNORE INTO workspaces(id,name) VALUES('r1-stage-company','Release 1 staging fixture');
INSERT OR IGNORE INTO memberships(workspace_id,uid,role) VALUES('r1-stage-company','r1-stage-owner','owner');
INSERT OR IGNORE INTO links(slug,destination,title,owner_uid,short_url,workspace_id) VALUES('r1-stage-report','https://example.com/report','Staging runtime report','r1-stage-owner','https://tinytrail-staging.hamedmstfa.workers.dev/r/r1-stage-report','r1-stage-company');
INSERT OR IGNORE INTO tracked_qrs(id,workspace_id,title,public_url,link_slug,created_by) VALUES('bd72f04b-0439-4dd2-bc6d-89d7c2c760e1','r1-stage-company','Staging runtime QR','https://tinytrail-staging.hamedmstfa.workers.dev/q/bd72f04b-0439-4dd2-bc6d-89d7c2c760e1','r1-stage-report','r1-stage-owner');
INSERT OR IGNORE INTO tracked_qrs(id,workspace_id,title,public_url,destination,state,created_by) VALUES('bd72f04b-0439-4dd2-bc6d-89d7c2c760e2','r1-stage-company','Disabled fixture QR','https://tinytrail-staging.hamedmstfa.workers.dev/q/bd72f04b-0439-4dd2-bc6d-89d7c2c760e2','https://example.com/disabled','disabled','r1-stage-owner');
INSERT OR IGNORE INTO analytics_settings(workspace_id,enabled,tracking_since,updated_at) VALUES('r1-stage-company',1,strftime('%s','now')*1000,strftime('%s','now')*1000);
INSERT OR IGNORE INTO analytics_periods(id,workspace_id,started_at) VALUES('r1-stage-period','r1-stage-company',strftime('%s','now')*1000);
