PRAGMA foreign_keys = ON;

CREATE TABLE `_0026_cfp_form_fields` AS SELECT * FROM `cfp_form_fields`;

DROP TABLE `cfp_form_fields`;

CREATE TABLE `cfp_form_fields` (
  organization_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN('submission','participant')),
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  placeholder TEXT,
  kind TEXT NOT NULL CHECK(kind IN('file_request','text','rich_text','email','url','select','multi_select','boolean','number')),
  required INTEGER NOT NULL CHECK(required IN(0,1)),
  options_json TEXT NOT NULL CHECK(json_valid(options_json) AND json_type(options_json)='array'),
  file_owner TEXT,
  allowed_mime_types_json TEXT CHECK(allowed_mime_types_json IS NULL OR (json_valid(allowed_mime_types_json) AND json_type(allowed_mime_types_json)='array')),
  max_bytes INTEGER,
  reusable_field_id TEXT,
  reusable_field_version INTEGER,
  sort_order INTEGER NOT NULL CHECK(sort_order>=0),
  PRIMARY KEY(organization_id,form_id,id),
  FOREIGN KEY(organization_id,form_id) REFERENCES cfp_forms(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY(organization_id,form_id,section_id) REFERENCES cfp_form_sections(organization_id,form_id,id) ON DELETE CASCADE,
  FOREIGN KEY(organization_id,reusable_field_id,reusable_field_version) REFERENCES reusable_fields(organization_id,id,version) ON DELETE RESTRICT,
  UNIQUE(organization_id,form_id,field_key),
  UNIQUE(organization_id,form_id,scope,sort_order),
  CHECK((kind='file_request' AND file_owner IN('submission','participant') AND allowed_mime_types_json IS NOT NULL AND max_bytes>0) OR (kind<>'file_request' AND file_owner IS NULL AND allowed_mime_types_json IS NULL AND max_bytes IS NULL)),
  CHECK((reusable_field_id IS NULL)=(reusable_field_version IS NULL))
) STRICT;

CREATE INDEX `cfp_form_fields_order_idx`
ON `cfp_form_fields`(organization_id,form_id,scope,sort_order);

CREATE INDEX `cfp_form_fields_reusable_idx`
ON `cfp_form_fields`(organization_id,reusable_field_id,reusable_field_version);

INSERT INTO `cfp_form_fields` SELECT * FROM `_0026_cfp_form_fields`;

DROP TABLE `_0026_cfp_form_fields`;
