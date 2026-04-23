-- ============================================================
-- Zazi iZandi App - Consolidated Initial Schema
-- ============================================================
-- Single migration representing the final state of Masi's 10-migration
-- evolution, plus ZZ-specific changes:
--   - staff_identity_links (replaces users profile table per canonical identity contract)
--   - Session timer columns on sessions (started_at, ended_at, duration_seconds)
--   - No job_title enum (ZZ has one implicit role: Education Assistant)
--   - schools.name BTREE index for search filtering
--   - No legacy class/teacher/school TEXT columns on children (fresh schema, no older
--     app versions in the wild)
-- All EA-owned tables FK to auth.users(id) directly (not to an intermediate profile
-- table), per the canonical identity contract. staff_identity_links is supplementary.
--
-- Security + performance hardening (applied before first deploy):
--   - Every function has SET search_path = public, pg_temp in its attribute clause
--     (closes function_search_path_mutable advisor; critical for the three
--     SECURITY DEFINER functions).
--   - RLS policies reference (select auth.uid()) instead of auth.uid() so the
--     planner evaluates the current user once per query, not once per row
--     (closes auth_rls_initplan advisor).
--   - classes.school_id has a covering index (closes unindexed_foreign_keys advisor).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. staff_identity_links  (canonical identity + optional bridge IDs)
-- ============================================================
CREATE TABLE staff_identity_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional transitional bridge IDs
  teampact_user_id BIGINT UNIQUE,
  airtable_record_id TEXT UNIQUE,
  -- Optional profile metadata (used by AI prompts + mobile UI)
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'ea',
  school_id UUID,                       -- FK added after schools table is created
  assigned_school TEXT,                 -- denormalized display name
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_staff_identity_links_school ON staff_identity_links(school_id);

ALTER TABLE staff_identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON staff_identity_links FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON staff_identity_links FOR UPDATE
  USING (user_id = (select auth.uid()));

-- Auto-create a staff_identity_links row when a new auth user signs in.
-- This means mobile client never has to insert into this table — the
-- row exists by the time the first authenticated request reaches FastAPI.
CREATE OR REPLACE FUNCTION create_staff_identity_link_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.staff_identity_links (user_id, display_name, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_staff_identity_link_for_new_user();

-- ============================================================
-- 2. schools  (admin-managed, read-only for field workers)
-- ============================================================
CREATE TABLE schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_schools_name ON schools(name);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view schools"
  ON schools FOR SELECT
  TO authenticated
  USING (true);

-- Wire up staff_identity_links.school_id FK now that schools exists
ALTER TABLE staff_identity_links
  ADD CONSTRAINT staff_identity_links_school_id_fkey
  FOREIGN KEY (school_id) REFERENCES schools(id);

-- ============================================================
-- 3. classes  (offline-first CRUD by staff)
-- ============================================================
CREATE TABLE classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                   -- e.g. "1A", "2B"
  grade TEXT NOT NULL,                  -- e.g. "Grade R", "Grade 1"
  teacher TEXT NOT NULL,
  home_language TEXT NOT NULL,
  school_id UUID REFERENCES schools(id) ON DELETE RESTRICT NOT NULL,
  staff_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, name, school_id)
);
CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_classes_staff_id ON classes(staff_id);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Dual SELECT policies: staff_id for steady-state, created_by for upsert visibility
CREATE POLICY "Users can view own classes"
  ON classes FOR SELECT TO authenticated USING (staff_id = (select auth.uid()));

CREATE POLICY "Users can view own created classes"
  ON classes FOR SELECT TO authenticated USING (created_by = (select auth.uid()));

CREATE POLICY "Users can insert own classes"
  ON classes FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Users can update own classes"
  ON classes FOR UPDATE TO authenticated USING (staff_id = (select auth.uid()));

CREATE POLICY "Users can delete own classes"
  ON classes FOR DELETE TO authenticated USING (staff_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION set_class_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER classes_set_created_by
  BEFORE INSERT ON classes
  FOR EACH ROW EXECUTE FUNCTION set_class_created_by();

CREATE OR REPLACE FUNCTION update_class_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER classes_update_timestamp
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_class_timestamp();

-- ============================================================
-- 4. children
-- ============================================================
-- No FK from assessments/letter_mastery back to children (offline-sync cascade avoidance).
-- created_by is auto-populated by trigger; used for upsert RLS visibility.
CREATE TABLE children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age > 0 AND age < 18),
  gender TEXT,
  group_name TEXT,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_children_class_id ON children(class_id);
CREATE INDEX idx_children_created_by ON children(created_by);

ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Auto-set created_by on insert (fires on INSERT only, so upserts preserve existing value)
CREATE OR REPLACE FUNCTION set_children_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER children_set_created_by
  BEFORE INSERT ON children
  FOR EACH ROW EXECUTE FUNCTION set_children_created_by();

CREATE OR REPLACE FUNCTION update_children_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER children_updated_at_trigger
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION update_children_updated_at();

-- ============================================================
-- 5. staff_children  (junction for many-to-many staff↔child)
-- ============================================================
CREATE TABLE staff_children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, child_id)
);
CREATE INDEX idx_staff_children_staff_id ON staff_children(staff_id);
CREATE INDEX idx_staff_children_child_id ON staff_children(child_id);

ALTER TABLE staff_children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments" ON staff_children
  FOR SELECT USING (staff_id = (select auth.uid()));
CREATE POLICY "Users can create assignments" ON staff_children
  FOR INSERT WITH CHECK (staff_id = (select auth.uid()));
CREATE POLICY "Users can delete own assignments" ON staff_children
  FOR DELETE USING (staff_id = (select auth.uid()));

-- Dual SELECT policy on children: steady-state via junction + upsert visibility via created_by
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_children
      WHERE staff_children.child_id = children.id
      AND staff_children.staff_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can view own created children" ON children
  FOR SELECT USING (created_by = (select auth.uid()));

CREATE POLICY "Users can insert children" ON children
  FOR INSERT WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Users can update assigned children" ON children
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff_children
      WHERE staff_children.child_id = children.id
      AND staff_children.staff_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete assigned children" ON children
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM staff_children
      WHERE staff_children.child_id = children.id
      AND staff_children.staff_id = (select auth.uid())
    )
  );

-- ============================================================
-- 6. groups  +  children_groups  (junction)
-- ============================================================
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  staff_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  UNIQUE(staff_id, name)
);
CREATE INDEX idx_groups_staff_id ON groups(staff_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own groups" ON groups
  FOR SELECT USING (staff_id = (select auth.uid()));
CREATE POLICY "Users can insert own groups" ON groups
  FOR INSERT WITH CHECK (staff_id = (select auth.uid()));
CREATE POLICY "Users can update own groups" ON groups
  FOR UPDATE USING (staff_id = (select auth.uid()));
CREATE POLICY "Users can delete own groups" ON groups
  FOR DELETE USING (staff_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION update_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER groups_updated_at_trigger
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_groups_updated_at();

CREATE TABLE children_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID REFERENCES children(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(child_id, group_id)
);
CREATE INDEX idx_children_groups_child_id ON children_groups(child_id);
CREATE INDEX idx_children_groups_group_id ON children_groups(group_id);

ALTER TABLE children_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own group assignments" ON children_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = children_groups.group_id
      AND groups.staff_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert own group assignments" ON children_groups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = children_groups.group_id
      AND groups.staff_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete own group assignments" ON children_groups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = children_groups.group_id
      AND groups.staff_id = (select auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION get_children_in_group(group_uuid UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  age INTEGER,
  gender TEXT,
  class_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.first_name, c.last_name, c.age, c.gender, c.class_id
  FROM children c
  INNER JOIN children_groups cg ON c.id = cg.child_id
  WHERE cg.group_id = group_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- 7. time_entries  (clock-in/clock-out with GPS)
-- ============================================================
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sign_in_time TIMESTAMPTZ NOT NULL,
  sign_in_lat DECIMAL(9, 6) NOT NULL,
  sign_in_lon DECIMAL(9, 6) NOT NULL,
  sign_out_time TIMESTAMPTZ,
  sign_out_lat DECIMAL(9, 6),
  sign_out_lon DECIMAL(9, 6),
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_sign_in_time ON time_entries(sign_in_time);
CREATE INDEX idx_time_entries_synced ON time_entries(synced);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own time entries" ON time_entries
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can insert own time entries" ON time_entries
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update own time entries" ON time_entries
  FOR UPDATE USING (user_id = (select auth.uid()));

-- ============================================================
-- 8. sessions  (with ZZ session timer fields)
-- ============================================================
-- started_at, ended_at, duration_seconds are new to ZZ. Nullable so the
-- schema stays backwards-compatible if an older client ships without the timer.
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_type TEXT NOT NULL,
  session_date DATE NOT NULL,
  children_ids UUID[] NOT NULL,
  group_ids UUID[],
  activities JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  -- Session timer (ZZ Phase 1)
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_date ON sessions(session_date);
CREATE INDEX idx_sessions_synced ON sessions(synced);
CREATE INDEX idx_sessions_children_ids ON sessions USING GIN(children_ids);
CREATE INDEX idx_sessions_group_ids ON sessions USING GIN(group_ids);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION update_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER sessions_updated_at_trigger
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_sessions_updated_at();

-- ============================================================
-- 9. assessments  (EGRA Letter & Words)
-- ============================================================
-- No FK on child_id to avoid offline-sync cascade issues.
-- user_id is the single ownership field — no separate created_by.
-- date_assessed is TEXT YYYY-MM-DD to avoid timezone day-shift bugs.
-- items_tested stores the ordered item list used in the assessment (self-contained).
CREATE TABLE assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  child_id UUID NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'letter_egra',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  letter_set_id TEXT NOT NULL,
  letter_language TEXT NOT NULL,
  completion_time INTEGER NOT NULL,
  letters_attempted INTEGER NOT NULL,
  correct_responses INTEGER NOT NULL,
  accuracy INTEGER NOT NULL,
  correct_letters JSONB NOT NULL DEFAULT '[]',
  incorrect_letters JSONB NOT NULL DEFAULT '[]',
  last_letter_attempted JSONB,
  items_tested JSONB,
  date_assessed TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_child_id ON assessments(child_id);
CREATE INDEX idx_assessments_synced ON assessments(synced);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_own ON assessments FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY insert_own ON assessments FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY update_own ON assessments FOR UPDATE USING (user_id = (select auth.uid()));

-- ============================================================
-- 10. letter_mastery  (coach-taught letter mastery; assessment mastery is derived on the fly)
-- ============================================================
CREATE TABLE letter_mastery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  child_id UUID NOT NULL,
  letter TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'taught',
  language TEXT NOT NULL,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_letter_mastery_unique
  ON letter_mastery(user_id, child_id, letter, language);
CREATE INDEX idx_letter_mastery_child ON letter_mastery(child_id);
CREATE INDEX idx_letter_mastery_user ON letter_mastery(user_id);

ALTER TABLE letter_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_own ON letter_mastery FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY insert_own ON letter_mastery FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY update_own ON letter_mastery FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY delete_own ON letter_mastery FOR DELETE USING (user_id = (select auth.uid()));

-- ============================================================
-- Migration Complete
-- ============================================================
-- Next steps:
-- 1. Pre-populate `schools` with ZZ programme schools (separate seed SQL).
-- 2. Create first admin user via Supabase dashboard; the `on_auth_user_created`
--    trigger will auto-insert their `staff_identity_links` row.
-- 3. Update the admin's row to set `first_name`, `last_name`, `school_id`.
-- 4. Wire the mobile app's `app.json.extra` with this project's URL + anon key.
-- ============================================================
