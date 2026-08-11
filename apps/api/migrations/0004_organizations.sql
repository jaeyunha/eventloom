-- Organizations are identity/tenant metadata owned by D1; business records remain in Airtable.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  organization_id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json) AND json_type(config_json) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations(slug COLLATE NOCASE);

-- Materialize every existing membership tenant without introducing a tenant alias. The window rank
-- keeps generated slugs unique when legacy organization IDs normalize to the same slug.
WITH source AS (
  SELECT organization_id, MIN(created_at) AS created_at, MAX(updated_at) AS updated_at
    FROM organization_memberships
   WHERE organization_id IS NOT NULL AND length(trim(organization_id)) > 0
   GROUP BY organization_id
), raw AS (
  SELECT organization_id,
         created_at,
         updated_at,
         lower(trim(
           replace(replace(replace(replace(replace(organization_id, '_', '-'), ' ', '-'), '/', '-'), '.', '-'), ':', '-')
         , '-')) AS raw_slug
    FROM source
), normalized AS (
  SELECT organization_id,
         created_at,
         updated_at,
         CASE
           WHEN raw_slug <> ''
            AND raw_slug NOT GLOB '*[^a-z0-9-]*'
            AND substr(raw_slug, 1, 1) <> '-'
            AND substr(raw_slug, -1, 1) <> '-'
           THEN substr(raw_slug, 1, 64)
           ELSE substr('org-' || lower(hex(organization_id)), 1, 64)
         END AS base_slug
    FROM raw
), ranked AS (
  SELECT organization_id,
         created_at,
         updated_at,
         base_slug,
         row_number() OVER (PARTITION BY base_slug ORDER BY organization_id) AS slug_number
    FROM normalized
)
INSERT OR IGNORE INTO organizations (
  organization_id, slug, name, config_json, created_at, updated_at
)
SELECT organization_id,
       CASE
         WHEN slug_number = 1 THEN rtrim(substr(base_slug, 1, 64), '-')
         ELSE rtrim(substr(base_slug, 1, max(1, 64 - length('-' || slug_number))), '-') || '-' || slug_number
       END,
       substr(trim(organization_id), 1, 200),
       '{}',
       created_at,
       updated_at
  FROM ranked
 WHERE NOT EXISTS (
   SELECT 1 FROM organizations AS existing WHERE existing.organization_id = ranked.organization_id
 );
