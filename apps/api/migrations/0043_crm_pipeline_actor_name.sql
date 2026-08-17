PRAGMA foreign_keys = ON;

ALTER TABLE crm_pipeline_history ADD COLUMN actor_name TEXT NOT NULL DEFAULT '';

UPDATE crm_pipeline_history
SET actor_name = actor_id
WHERE actor_name = '';
