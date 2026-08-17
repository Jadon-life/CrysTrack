-- CrysTrack Initial Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase Auth users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  timezone VARCHAR(100) DEFAULT 'UTC',
  locale VARCHAR(10) DEFAULT 'en-US',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_preference VARCHAR(50) DEFAULT 'adaptive',
  reduced_motion BOOLEAN DEFAULT FALSE,
  weather_enabled BOOLEAN DEFAULT TRUE,
  dnd_enabled BOOLEAN DEFAULT FALSE,
  dnd_start_time VARCHAR(5),
  dnd_end_time VARCHAR(5),
  reminder_defaults JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can only access their own profile"
  ON profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own preferences"
  ON user_preferences FOR ALL USING (auth.uid() = user_id);

-- Recurring Tasks
CREATE TYPE task_status AS ENUM ('pending', 'completed', 'missed', 'not_scheduled');

CREATE TABLE recurring_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  preferred_time VARCHAR(5),
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX task_user_id_idx ON recurring_tasks(user_id);

CREATE TABLE task_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
);

CREATE TABLE task_occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  status task_status DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  note TEXT
);

CREATE INDEX occurrence_task_date_idx ON task_occurrences(task_id, date);

-- Goals
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ,
  measurable BOOLEAN DEFAULT FALSE,
  target_value DECIMAL(10,2),
  progress_value DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'active',
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX goal_user_id_idx ON goals(user_id);

CREATE TABLE goal_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  duration_minutes INTEGER,
  response_text TEXT,
  learned_text TEXT,
  blockers TEXT
);

CREATE TABLE goal_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  summary TEXT,
  risk_level VARCHAR(20),
  estimate_text TEXT,
  recommendations TEXT,
  model_version VARCHAR(50)
);

-- Assignments
CREATE TYPE assignment_status AS ENUM ('upcoming', 'due_soon', 'due_today', 'overdue', 'completed');
CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ NOT NULL,
  priority priority DEFAULT 'medium',
  status assignment_status DEFAULT 'upcoming',
  category VARCHAR(100),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX assignment_user_id_idx ON assignments(user_id);
CREATE INDEX assignment_deadline_idx ON assignments(deadline);

-- Finance
CREATE TYPE money_type AS ENUM ('income', 'expense', 'saving', 'transfer');

CREATE TABLE finance_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  target_amount DECIMAL(12,2) NOT NULL,
  current_amount DECIMAL(12,2) DEFAULT 0,
  deadline TIMESTAMPTZ,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX finance_target_user_id_idx ON finance_targets(user_id);

CREATE TABLE money_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type money_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(255),
  category VARCHAR(100),
  note TEXT,
  target_id UUID REFERENCES finance_targets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX money_entry_user_id_idx ON money_entries(user_id);

-- Reminders & Push
CREATE TYPE reminder_channel AS ENUM ('push', 'email');
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'snoozed', 'cancelled');

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  channel reminder_channel DEFAULT 'push',
  status reminder_status DEFAULT 'pending',
  snoozed_until TIMESTAMPTZ,
  dnd_respected BOOLEAN DEFAULT TRUE
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  device_label VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity / History
CREATE TYPE activity_type AS ENUM ('task_completed', 'task_missed', 'goal_checkin', 'assignment_completed', 'finance_entry', 'reminder_sent');

CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata_json JSONB
);

CREATE INDEX activity_user_id_idx ON activity_events(user_id);
CREATE INDEX activity_created_at_idx ON activity_events(created_at);

-- RLS for all tables
ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- Generic user-scoped policies
CREATE POLICY task_user_isolation ON recurring_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY schedule_user_isolation ON task_schedules FOR ALL USING (EXISTS (SELECT 1 FROM recurring_tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY occurrence_user_isolation ON task_occurrences FOR ALL USING (EXISTS (SELECT 1 FROM recurring_tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY goal_user_isolation ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY checkin_user_isolation ON goal_checkins FOR ALL USING (auth.uid() = user_id);
CREATE POLICY assignment_user_isolation ON assignments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY finance_target_user_isolation ON finance_targets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY money_entry_user_isolation ON money_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY reminder_user_isolation ON reminders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY push_sub_user_isolation ON push_subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY activity_user_isolation ON activity_events FOR ALL USING (auth.uid() = user_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_prefs_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
