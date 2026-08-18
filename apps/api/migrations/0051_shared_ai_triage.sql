ALTER TABLE review_rounds ADD COLUMN ai_triage_enabled INTEGER NOT NULL DEFAULT 0;

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE __shared_ai_triage_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  assignment_id TEXT,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL,
  rubric_revision INTEGER NOT NULL,
  submission_revision INTEGER NOT NULL,
  rubric_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_references_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  override_json TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, plan_id)
    REFERENCES review_plans(organization_id, event_id, id)
    ON UPDATE NO ACTION ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, assignment_id)
    REFERENCES review_assignments(organization_id, event_id, id)
    ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT evaluation_suggestions_revision_check
    CHECK (plan_revision > 0 AND rubric_revision > 0 AND submission_revision > 0 AND version > 0),
  CONSTRAINT evaluation_suggestions_source_json_check
    CHECK (json_valid(source_references_json) AND json_type(source_references_json) = 'array'),
  CONSTRAINT evaluation_suggestions_provenance_json_check
    CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
  UNIQUE (organization_id, event_id, id)
) STRICT;

CREATE TABLE __shared_ai_triage_candidates AS
SELECT * FROM evaluation_suggestion_candidates;

CREATE TABLE __shared_ai_triage_history AS
SELECT * FROM evaluation_suggestion_history;

INSERT INTO __shared_ai_triage_suggestions (
  id, organization_id, event_id, plan_id, round_id, assignment_id,
  submission_id, reviewer_id, plan_revision, rubric_revision,
  submission_revision, rubric_id, provider, model, prompt_version,
  generated_at, source_references_json, provenance_json, override_json,
  status, version, created_at, updated_at
)
SELECT
  id, organization_id, event_id, plan_id, round_id, assignment_id,
  submission_id, reviewer_id, plan_revision, rubric_revision,
  submission_revision, rubric_id, provider, model, prompt_version,
  generated_at, source_references_json, provenance_json, NULL,
  status, version, created_at, updated_at
FROM evaluation_suggestions;

DROP TABLE evaluation_suggestion_history;
DROP TABLE evaluation_suggestion_candidates;
DROP TABLE evaluation_suggestions;

ALTER TABLE __shared_ai_triage_suggestions RENAME TO evaluation_suggestions;

CREATE TABLE evaluation_suggestion_candidates (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  value REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (organization_id, suggestion_id, id),
  FOREIGN KEY (organization_id, event_id, suggestion_id)
    REFERENCES evaluation_suggestions(organization_id, event_id, id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT evaluation_suggestion_candidates_json_check
    CHECK (
      ordinal >= 0
      AND json_valid(evidence_json)
      AND json_type(evidence_json) = 'array'
      AND json_valid(provenance_json)
      AND json_type(provenance_json) = 'object'
    )
) STRICT;

CREATE TABLE evaluation_suggestion_history (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  at TEXT NOT NULL,
  reason TEXT,
  values_json TEXT,
  PRIMARY KEY (organization_id, suggestion_id, ordinal),
  FOREIGN KEY (organization_id, event_id, suggestion_id)
    REFERENCES evaluation_suggestions(organization_id, event_id, id)
    ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT evaluation_suggestion_history_values_check
    CHECK (
      ordinal >= 0
      AND (
        values_json IS NULL
        OR (json_valid(values_json) AND json_type(values_json) = 'object')
      )
    )
) STRICT;

INSERT INTO evaluation_suggestion_candidates (
  organization_id, event_id, suggestion_id, id, criterion_id, value,
  evidence_json, provenance_json, ordinal
)
SELECT
  organization_id, event_id, suggestion_id, id, criterion_id, value,
  evidence_json, provenance_json, ordinal
FROM __shared_ai_triage_candidates;

INSERT INTO evaluation_suggestion_history (
  organization_id, event_id, suggestion_id, ordinal, action, actor_id,
  at, reason, values_json
)
SELECT
  organization_id, event_id, suggestion_id, ordinal, action, actor_id,
  at, reason, values_json
FROM __shared_ai_triage_history;

DROP TABLE __shared_ai_triage_candidates;
DROP TABLE __shared_ai_triage_history;

CREATE INDEX evaluation_suggestions_plan_idx
  ON evaluation_suggestions (organization_id, event_id, plan_id, round_id, created_at);
CREATE INDEX evaluation_suggestions_assignment_idx
  ON evaluation_suggestions (organization_id, event_id, assignment_id, created_at);
CREATE INDEX evaluation_suggestions_status_idx
  ON evaluation_suggestions (organization_id, event_id, status, updated_at);
CREATE UNIQUE INDEX evaluation_suggestions_organization_id_id_unique
  ON evaluation_suggestions (organization_id, id);
CREATE INDEX evaluation_suggestion_candidates_order_idx
  ON evaluation_suggestion_candidates (organization_id, event_id, suggestion_id, criterion_id, ordinal);
CREATE UNIQUE INDEX evaluation_suggestion_candidates_criterion_order_unique
  ON evaluation_suggestion_candidates (organization_id, suggestion_id, criterion_id, ordinal);
CREATE INDEX evaluation_suggestion_history_order_idx
  ON evaluation_suggestion_history (organization_id, event_id, suggestion_id, ordinal);
