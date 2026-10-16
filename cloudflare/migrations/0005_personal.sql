ALTER TABLE workspaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'company' CHECK(kind IN ('company','personal'));
ALTER TABLE workspaces ADD COLUMN personal_owner_uid TEXT REFERENCES users(uid);
CREATE UNIQUE INDEX personal_workspace_owner ON workspaces(personal_owner_uid) WHERE kind='personal';
CREATE TRIGGER personal_workspace_insert BEFORE INSERT ON workspaces
WHEN (NEW.kind='personal' AND NEW.personal_owner_uid IS NULL) OR (NEW.kind='company' AND NEW.personal_owner_uid IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Invalid workspace ownership'); END;
CREATE TRIGGER workspace_identity_immutable BEFORE UPDATE OF kind,personal_owner_uid ON workspaces
WHEN NEW.kind<>OLD.kind OR NEW.personal_owner_uid IS NOT OLD.personal_owner_uid
BEGIN SELECT RAISE(ABORT,'Workspace ownership is immutable'); END;
CREATE TRIGGER personal_membership_insert BEFORE INSERT ON memberships
WHEN (SELECT kind FROM workspaces WHERE id=NEW.workspace_id)='personal'
BEGIN SELECT RAISE(ABORT,'Personal workspaces cannot have members'); END;
CREATE TRIGGER personal_membership_update BEFORE UPDATE OF workspace_id ON memberships
WHEN (SELECT kind FROM workspaces WHERE id=NEW.workspace_id)='personal'
BEGIN SELECT RAISE(ABORT,'Personal workspaces cannot have members'); END;
