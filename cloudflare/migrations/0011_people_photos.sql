CREATE TABLE people_photos (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES people(id),
 data BLOB NOT NULL CHECK(length(data)<=120000),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 256),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 256),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX people_photos_profile ON people_photos(profile_id);
