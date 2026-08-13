PRAGMA foreign_keys = ON;

CREATE TABLE events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active','archived')),
  time_zone TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  venue TEXT,
  cfp_enabled INTEGER NOT NULL CHECK (cfp_enabled IN (0,1)),
  cfp_opens_at TEXT,
  cfp_closes_at TEXT,
  default_duration_minutes INTEGER NOT NULL CHECK (default_duration_minutes > 0),
  default_calendar_time_zone TEXT NOT NULL,
  default_calendar_location TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,slug),
  CHECK (ends_at > starts_at),
  CHECK ((cfp_opens_at IS NULL AND cfp_closes_at IS NULL) OR (cfp_opens_at IS NOT NULL AND cfp_closes_at IS NOT NULL AND cfp_closes_at > cfp_opens_at))
) STRICT;
CREATE INDEX events_organization_status_updated_idx ON events(organization_id,status,updated_at DESC);
CREATE INDEX events_organization_slug_idx ON events(organization_id,slug);

CREATE TABLE event_embed_configurations (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  widget_id TEXT NOT NULL CHECK (widget_id IN ('sessions','speakers','agenda','itinerary','gallery')),
  name TEXT NOT NULL,
  theme TEXT NOT NULL CHECK (theme IN ('auto','light','dark')),
  output_format TEXT NOT NULL CHECK (output_format IN ('styled-html','basic-html','json','xml','ical')),
  layout TEXT NOT NULL CHECK (layout IN ('comfortable','compact','list','grid','timeline')),
  display_fields_json TEXT NOT NULL CHECK (json_valid(display_fields_json) AND json_type(display_fields_json)='array'),
  track_ids_json TEXT NOT NULL CHECK (json_valid(track_ids_json) AND json_type(track_ids_json)='array'),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE,
  UNIQUE (organization_id,event_id,id),
  UNIQUE (organization_id,event_id,widget_id)
) STRICT;
CREATE INDEX event_embed_configurations_enabled_idx ON event_embed_configurations(organization_id,event_id,enabled,widget_id);

CREATE TABLE rooms (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE,
  capacity INTEGER NOT NULL CHECK (capacity >= 0), version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE,
  UNIQUE (organization_id,id), UNIQUE (organization_id,event_id,id), UNIQUE (organization_id,event_id,name)
) STRICT;
CREATE INDEX rooms_event_name_idx ON rooms(organization_id,event_id,name);

CREATE TABLE room_resources (
  organization_id TEXT NOT NULL, event_id TEXT NOT NULL, room_id TEXT NOT NULL, resource_id TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id,event_id,room_id,resource_id),
  FOREIGN KEY (organization_id,event_id,room_id) REFERENCES rooms(organization_id,event_id,id) ON DELETE CASCADE,
  UNIQUE (organization_id,event_id,room_id,ordinal)
) STRICT;
CREATE INDEX room_resources_resource_idx ON room_resources(organization_id,event_id,resource_id);

CREATE TABLE tracks (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE, UNIQUE (organization_id,id), UNIQUE (organization_id,event_id,id), UNIQUE (organization_id,event_id,name)
) STRICT;
CREATE INDEX tracks_event_name_idx ON tracks(organization_id,event_id,name);
CREATE TABLE formats (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE, UNIQUE (organization_id,id), UNIQUE (organization_id,event_id,id), UNIQUE (organization_id,event_id,name)
) STRICT;
CREATE INDEX formats_event_name_idx ON formats(organization_id,event_id,name);
CREATE TABLE levels (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE, UNIQUE (organization_id,id), UNIQUE (organization_id,event_id,id), UNIQUE (organization_id,event_id,name)
) STRICT;
CREATE INDEX levels_event_name_idx ON levels(organization_id,event_id,name);
CREATE TABLE tags (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE, UNIQUE (organization_id,id), UNIQUE (organization_id,event_id,id), UNIQUE (organization_id,event_id,name)
) STRICT;
CREATE INDEX tags_event_name_idx ON tags(organization_id,event_id,name);

CREATE TABLE session_statuses (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, value TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', agenda_eligible INTEGER NOT NULL CHECK (agenda_eligible IN (0,1)), sort_order INTEGER NOT NULL CHECK (sort_order >= 0), active INTEGER NOT NULL CHECK (active IN (0,1)), version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE,
  UNIQUE (organization_id,event_id,value), UNIQUE (organization_id,event_id,sort_order)
) STRICT;
CREATE INDEX session_statuses_active_order_idx ON session_statuses(organization_id,event_id,active,sort_order);

CREATE TABLE session_settings (
  id TEXT NOT NULL PRIMARY KEY, organization_id TEXT NOT NULL, event_id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE,
  UNIQUE (organization_id,event_id), UNIQUE (organization_id,event_id,id)
) STRICT;
CREATE INDEX session_settings_event_idx ON session_settings(organization_id,event_id);
