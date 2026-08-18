ALTER TABLE review_rounds ADD COLUMN ai_triage_enabled INTEGER NOT NULL DEFAULT 0;

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE _0051_evaluation_suggestions AS SELECT * FROM evaluation_suggestions;
CREATE TABLE _0051_evaluation_suggestion_candidates AS SELECT * FROM evaluation_suggestion_candidates;
CREATE TABLE _0051_evaluation_suggestion_history AS SELECT * FROM evaluation_suggestion_history;

DROP TABLE evaluation_suggestion_history;
DROP TABLE evaluation_suggestion_candidates;
DROP TABLE evaluation_suggestions;

CREATE TABLE evaluation_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  assignment_id TEXT,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  rubric_revision INTEGER NOT NULL CHECK (rubric_revision > 0),
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0),
  rubric_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_references_json TEXT NOT NULL CHECK (json_valid(source_references_json) AND json_type(source_references_json) = 'array'),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
  status TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, plan_id) REFERENCES review_plans(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, assignment_id) REFERENCES review_assignments(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id)
) STRICT;

CREATE TABLE evaluation_suggestion_candidates (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  value REAL NOT NULL,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json) AND json_type(evidence_json) = 'array'),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id, suggestion_id, id),
  FOREIGN KEY (organization_id, event_id, suggestion_id) REFERENCES evaluation_suggestions(organization_id, event_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, suggestion_id, criterion_id, ordinal)
) STRICT;

CREATE TABLE evaluation_suggestion_history (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  action TEXT NOT NULL,
  actor_id TEXT,
  at TEXT NOT NULL,
  reason TEXT,
  values_json TEXT CHECK (values_json IS NULL OR (json_valid(values_json) AND json_type(values_json) = 'object')),
  PRIMARY KEY (organization_id, suggestion_id, ordinal),
  FOREIGN KEY (organization_id, event_id, suggestion_id) REFERENCES evaluation_suggestions(organization_id, event_id, id) ON DELETE RESTRICT
) STRICT;

INSERT INTO evaluation_suggestions SELECT * FROM _0051_evaluation_suggestions;
INSERT INTO evaluation_suggestion_candidates SELECT * FROM _0051_evaluation_suggestion_candidates;
INSERT INTO evaluation_suggestion_history SELECT * FROM _0051_evaluation_suggestion_history;

ALTER TABLE evaluation_suggestions ADD COLUMN override_json TEXT;

CREATE INDEX evaluation_suggestions_plan_idx ON evaluation_suggestions (organization_id, event_id, plan_id, round_id, created_at);
CREATE INDEX evaluation_suggestions_assignment_idx ON evaluation_suggestions (organization_id, event_id, assignment_id, created_at);
CREATE INDEX evaluation_suggestions_status_idx ON evaluation_suggestions (organization_id, event_id, status, updated_at);
CREATE UNIQUE INDEX evaluation_suggestions_shared_active_scope_unique ON evaluation_suggestions (organization_id, event_id, plan_id, round_id, submission_id) WHERE assignment_id IS NULL AND status IN ('pending', 'overridden');
CREATE INDEX evaluation_suggestion_candidates_order_idx ON evaluation_suggestion_candidates (organization_id, event_id, suggestion_id, criterion_id, ordinal);
CREATE INDEX evaluation_suggestion_history_order_idx ON evaluation_suggestion_history (organization_id, event_id, suggestion_id, ordinal);

DROP TABLE _0051_evaluation_suggestion_history;
DROP TABLE _0051_evaluation_suggestion_candidates;
DROP TABLE _0051_evaluation_suggestions;
