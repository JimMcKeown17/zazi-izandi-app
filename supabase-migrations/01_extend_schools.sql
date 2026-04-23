-- ============================================================
-- Extend `schools` with metadata + bridge IDs
-- ============================================================
-- Adds columns to capture the Masi schools database export:
--   - airtable_record_id  : Airtable's UID (e.g. "SCH-00276") — stable external ID
--   - masi_school_id      : Masi nonprofit's internal numeric ID (kept TEXT to
--                           preserve any future leading-zero IDs)
--   - school_type         : 'Primary' | 'ECD' | 'High School' (and future variants)
--   - suburb              : neighborhood / area
--   - latitude/longitude  : DECIMAL(9,6) matching time_entries' GPS columns,
--                           used later for sign-in proximity checks
--   - google_maps_url     : direct link
--   - info                : freeform multi-line school details (address, email,
--                           contact)
--
-- All new columns are NULLABLE so we can ingest a partial dataset and let
-- admins fill gaps over time. The two bridge IDs get UNIQUE constraints so
-- re-imports can use ON CONFLICT (airtable_record_id) DO UPDATE.
-- ============================================================

ALTER TABLE schools
  ADD COLUMN airtable_record_id TEXT UNIQUE,
  ADD COLUMN masi_school_id TEXT UNIQUE,
  ADD COLUMN school_type TEXT,
  ADD COLUMN suburb TEXT,
  ADD COLUMN latitude DECIMAL(9, 6),
  ADD COLUMN longitude DECIMAL(9, 6),
  ADD COLUMN google_maps_url TEXT,
  ADD COLUMN info TEXT;

CREATE INDEX idx_schools_suburb ON schools(suburb);
CREATE INDEX idx_schools_school_type ON schools(school_type);
