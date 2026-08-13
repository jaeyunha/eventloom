-- Evaluation plans, immutable round/rubric revisions, assignments, reviews, and decisions.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS review_plans (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'closed')),
  blind_review INTEGER NOT NULL CHECK (blind_review IN (0, 1)),
  closes_at TEXT,
  reviews_per_submission INTEGER NOT NULL CHECK (reviews_per_submission > 0),
  max_assignments_per_reviewer INTEGER NOT NULL CHECK (max_assignments_per_reviewer > 0),
  track_filter TEXT,
  auto_distribute INTEGER NOT NULL CHECK (auto_distribute IN (0, 1)),
  reviewer_projection_field_ids_json TEXT NOT NULL CHECK (json_valid(reviewer_projection_field_ids_json) AND json_type(reviewer_projection_field_ids_json) = 'array'),
  reviewer_projection_file_ids_json TEXT NOT NULL CHECK (json_valid(reviewer_projection_file_ids_json) AND json_type(reviewer_projection_file_ids_json) = 'array'),
  grading_revision INTEGER CHECK (grading_revision > 0),
  grading_locked_at TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  CHECK (grading_locked_at IS NULL OR grading_revision IS NOT NULL)
) STRICT;
CREATE INDEX IF NOT EXISTS review_plans_event_status_idx ON review_plans(organization_id, event_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS review_rounds (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  rubric_id TEXT NOT NULL,
  rubric_revision INTEGER NOT NULL CHECK (rubric_revision > 0),
  opens_at TEXT,
  closes_at TEXT,
  blind_review INTEGER NOT NULL CHECK (blind_review IN (0, 1)),
  anonymization TEXT NOT NULL CHECK (anonymization IN ('none', 'single', 'double')),
  track_filter TEXT,
  PRIMARY KEY (organization_id, plan_id, id, revision),
  FOREIGN KEY (organization_id, event_id, plan_id) REFERENCES review_plans(organization_id, event_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, event_id, plan_id, id, revision),
  UNIQUE (organization_id, event_id, id, revision),
  UNIQUE (organization_id, plan_id, sequence, revision),
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
) STRICT;
CREATE INDEX IF NOT EXISTS review_rounds_current_idx ON review_rounds(organization_id, event_id, plan_id, sequence, revision DESC);

CREATE TABLE IF NOT EXISTS review_rubrics (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  name TEXT NOT NULL,
  PRIMARY KEY (organization_id, plan_id, id, revision),
  FOREIGN KEY (organization_id, event_id, plan_id) REFERENCES review_plans(organization_id, event_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, event_id, plan_id, id, revision)
) STRICT;
CREATE INDEX IF NOT EXISTS review_rubrics_plan_idx ON review_rubrics(organization_id, event_id, plan_id, id, revision DESC);

CREATE TABLE IF NOT EXISTS review_criteria (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  rubric_revision INTEGER NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  minimum REAL NOT NULL,
  maximum REAL NOT NULL,
  weight REAL NOT NULL CHECK (weight > 0),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  input_type TEXT NOT NULL CHECK (input_type IN ('numeric', 'dropdown', 'free_text')),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (organization_id, plan_id, rubric_id, rubric_revision, id),
  FOREIGN KEY (organization_id, event_id, plan_id, rubric_id, rubric_revision) REFERENCES review_rubrics(organization_id, event_id, plan_id, id, revision) ON DELETE CASCADE,
  UNIQUE (organization_id, plan_id, rubric_id, rubric_revision, sort_order),
  CHECK (maximum >= minimum)
) STRICT;
CREATE INDEX IF NOT EXISTS review_criteria_order_idx ON review_criteria(organization_id, event_id, plan_id, rubric_id, rubric_revision, sort_order);

CREATE TABLE IF NOT EXISTS review_criterion_options (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  rubric_revision INTEGER NOT NULL,
  criterion_id TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (organization_id, plan_id, rubric_id, rubric_revision, criterion_id, id),
  FOREIGN KEY (organization_id, plan_id, rubric_id, rubric_revision, criterion_id) REFERENCES review_criteria(organization_id, plan_id, rubric_id, rubric_revision, id) ON DELETE CASCADE,
  UNIQUE (organization_id, plan_id, rubric_id, rubric_revision, criterion_id, value),
  UNIQUE (organization_id, plan_id, rubric_id, rubric_revision, criterion_id, sort_order)
) STRICT;
CREATE INDEX IF NOT EXISTS review_criterion_options_order_idx ON review_criterion_options(organization_id, event_id, plan_id, rubric_id, rubric_revision, criterion_id, sort_order);

CREATE TABLE IF NOT EXISTS reviewer_pools (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  round_revision INTEGER NOT NULL CHECK (round_revision > 0),
  name TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, round_id, round_revision) REFERENCES review_rounds(organization_id, event_id, id, revision) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  UNIQUE (organization_id, event_id, round_id, round_revision)
) STRICT;
CREATE INDEX IF NOT EXISTS reviewer_pools_event_idx ON reviewer_pools(organization_id, event_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reviewer_pool_members (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  PRIMARY KEY (organization_id, event_id, pool_id, reviewer_id),
  FOREIGN KEY (organization_id, event_id, pool_id) REFERENCES reviewer_pools(organization_id, event_id, id) ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS reviewer_pool_members_reviewer_idx ON reviewer_pool_members(organization_id, event_id, reviewer_id, pool_id);

CREATE TABLE IF NOT EXISTS review_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  round_revision INTEGER NOT NULL CHECK (round_revision > 0),
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('assigned', 'in_progress', 'submitted', 'abstained', 'superseded')),
  predecessor_assignment_id TEXT,
  successor_assignment_id TEXT,
  superseded_reason TEXT,
  superseded_at TEXT,
  plan_version INTEGER NOT NULL CHECK (plan_version > 0),
  rubric_revision INTEGER NOT NULL CHECK (rubric_revision > 0),
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, plan_id) REFERENCES review_plans(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, round_id, round_revision) REFERENCES review_rounds(organization_id, event_id, id, revision) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, submission_id) REFERENCES submissions(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, predecessor_assignment_id) REFERENCES review_assignments(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, successor_assignment_id) REFERENCES review_assignments(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  CHECK (predecessor_assignment_id IS NULL OR predecessor_assignment_id <> id),
  CHECK (successor_assignment_id IS NULL OR successor_assignment_id <> id),
  CHECK ((status = 'superseded') = (superseded_reason IS NOT NULL AND superseded_at IS NOT NULL)),
  CHECK (status = 'superseded' OR successor_assignment_id IS NULL)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS review_assignments_active_unique_idx ON review_assignments(organization_id, event_id, plan_id, round_id, submission_id, reviewer_id) WHERE status <> 'superseded';
CREATE INDEX IF NOT EXISTS review_assignments_plan_status_idx ON review_assignments(organization_id, event_id, plan_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS review_assignments_reviewer_idx ON review_assignments(organization_id, event_id, reviewer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS review_assignments_submission_round_idx ON review_assignments(organization_id, event_id, submission_id, round_id, round_revision);
CREATE INDEX IF NOT EXISTS review_assignments_predecessor_idx ON review_assignments(organization_id, event_id, predecessor_assignment_id);
CREATE INDEX IF NOT EXISTS review_assignments_successor_idx ON review_assignments(organization_id, event_id, successor_assignment_id);

CREATE TABLE IF NOT EXISTS evaluation_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  comment TEXT NOT NULL,
  submitted_at TEXT,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  round_revision INTEGER NOT NULL CHECK (round_revision > 0),
  rubric_revision INTEGER NOT NULL CHECK (rubric_revision > 0),
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, assignment_id) REFERENCES review_assignments(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  UNIQUE (organization_id, event_id, assignment_id)
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_reviews_plan_idx ON evaluation_reviews(organization_id, event_id, plan_id, round_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS evaluation_reviews_submission_idx ON evaluation_reviews(organization_id, event_id, submission_id, round_id);

CREATE TABLE IF NOT EXISTS evaluation_scores (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  value_number REAL,
  value_text TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('human', 'ai')),
  human_confirmed_by TEXT,
  suggestion_id TEXT,
  suggestion_status TEXT CHECK (suggestion_status IN ('pending', 'accepted', 'edited', 'rejected', 'stale')),
  rubric_revision INTEGER NOT NULL CHECK (rubric_revision > 0),
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, review_id, criterion_id),
  FOREIGN KEY (organization_id, event_id, review_id) REFERENCES evaluation_reviews(organization_id, event_id, id) ON DELETE RESTRICT,
  CHECK ((value_number IS NOT NULL) <> (value_text IS NOT NULL)),
  CHECK ((origin = 'human' AND suggestion_id IS NULL AND suggestion_status IS NULL) OR (origin = 'ai' AND suggestion_id IS NOT NULL AND suggestion_status IS NOT NULL)),
  CHECK (human_confirmed_by IS NULL OR (origin = 'ai' AND suggestion_status IN ('accepted', 'edited')))
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_scores_review_idx ON evaluation_scores(organization_id, event_id, review_id);
CREATE INDEX IF NOT EXISTS evaluation_scores_suggestion_idx ON evaluation_scores(organization_id, event_id, suggestion_id);

CREATE TABLE IF NOT EXISTS evaluation_score_evidence (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  evidence TEXT NOT NULL,
  PRIMARY KEY (organization_id, review_id, criterion_id, ordinal),
  FOREIGN KEY (organization_id, review_id, criterion_id) REFERENCES evaluation_scores(organization_id, review_id, criterion_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_score_evidence_order_idx ON evaluation_score_evidence(organization_id, event_id, review_id, criterion_id, ordinal);

CREATE TABLE IF NOT EXISTS evaluation_conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  declared_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, assignment_id) REFERENCES review_assignments(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, assignment_id)
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_conflicts_plan_idx ON evaluation_conflicts(organization_id, event_id, plan_id, declared_at DESC);
CREATE INDEX IF NOT EXISTS evaluation_conflicts_reviewer_idx ON evaluation_conflicts(organization_id, event_id, reviewer_id, declared_at DESC);

CREATE TABLE IF NOT EXISTS evaluation_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'edited', 'rejected', 'stale')),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, plan_id) REFERENCES review_plans(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, assignment_id) REFERENCES review_assignments(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id)
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_suggestions_plan_idx ON evaluation_suggestions(organization_id, event_id, plan_id, round_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evaluation_suggestions_assignment_idx ON evaluation_suggestions(organization_id, event_id, assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evaluation_suggestions_status_idx ON evaluation_suggestions(organization_id, event_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS evaluation_suggestion_candidates (
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
CREATE INDEX IF NOT EXISTS evaluation_suggestion_candidates_order_idx ON evaluation_suggestion_candidates(organization_id, event_id, suggestion_id, criterion_id, ordinal);

CREATE TABLE IF NOT EXISTS evaluation_suggestion_history (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  action TEXT NOT NULL CHECK (action IN ('generate', 'stale', 'accept', 'edit', 'reject')),
  actor_id TEXT,
  at TEXT NOT NULL,
  reason TEXT,
  values_json TEXT CHECK (values_json IS NULL OR (json_valid(values_json) AND json_type(values_json) = 'object')),
  PRIMARY KEY (organization_id, suggestion_id, ordinal),
  FOREIGN KEY (organization_id, event_id, suggestion_id) REFERENCES evaluation_suggestions(organization_id, event_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_suggestion_history_order_idx ON evaluation_suggestion_history(organization_id, event_id, suggestion_id, ordinal);

CREATE TABLE IF NOT EXISTS evaluation_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'waitlisted', 'rejected')),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, plan_id) REFERENCES review_plans(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, submission_id) REFERENCES submissions(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  UNIQUE (organization_id, plan_id, submission_id)
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_decisions_event_idx ON evaluation_decisions(organization_id, event_id, plan_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS evaluation_decision_transitions (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  from_status TEXT CHECK (from_status IN ('accepted', 'waitlisted', 'rejected')),
  to_status TEXT NOT NULL CHECK (to_status IN ('accepted', 'waitlisted', 'rejected')),
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (organization_id, decision_id, ordinal),
  FOREIGN KEY (organization_id, event_id, decision_id) REFERENCES evaluation_decisions(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, decision_id, idempotency_key)
) STRICT;
CREATE INDEX IF NOT EXISTS evaluation_decision_transitions_order_idx ON evaluation_decision_transitions(organization_id, event_id, decision_id, ordinal);
