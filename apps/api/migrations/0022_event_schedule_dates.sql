PRAGMA foreign_keys = ON;

ALTER TABLE events
ADD COLUMN schedule_dates_json TEXT NOT NULL DEFAULT '[]'
CHECK (
  json_valid(schedule_dates_json)
  AND json_type(schedule_dates_json) = 'array'
);
