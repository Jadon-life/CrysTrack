-- CrysTrack adaptive experience, reminder delivery, Telegram and Goal Intelligence foundation.
-- Apply after 0001_product_integrity.sql.

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'task_skipped';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'skipped';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_timezone VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_city VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_country_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS current_location_updated_at TIMESTAMPTZ;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS default_reminder_channels TEXT[] DEFAULT ARRAY['push']::TEXT[],
  ADD COLUMN IF NOT EXISTS untimed_task_reminder_time VARCHAR(5) DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS incomplete_task_reminder_time VARCHAR(5) DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS location_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE user_preferences
  ALTER COLUMN reminder_defaults SET DEFAULT '{
    "task": {
      "beforeMinutes": 15,
      "atPreferredTime": true,
      "followUpMinutes": [120],
      "endOfDayReminder": true
    },
    "assignment": {
      "offsetMinutes": [1440, 120, 0]
    },
    "goal": {
      "deadlineOffsetMinutes": [10080, 4320, 1440]
    }
  }'::jsonb;

UPDATE user_preferences
SET reminder_defaults = '{
  "task": {
    "beforeMinutes": 15,
    "atPreferredTime": true,
    "followUpMinutes": [120],
    "endOfDayReminder": true
  },
  "assignment": {
    "offsetMinutes": [1440, 120, 0]
  },
  "goal": {
    "deadlineOffsetMinutes": [10080, 4320, 1440]
  }
}'::jsonb
WHERE reminder_defaults IS NULL;

ALTER TABLE recurring_tasks
  ADD COLUMN IF NOT EXISTS reminder_config JSONB DEFAULT '{
    "enabled": true,
    "channels": ["push"],
    "beforeMinutes": 15,
    "atPreferredTime": true,
    "followUpMinutes": [120],
    "endOfDayReminder": true
  }'::jsonb;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS reminder_config JSONB DEFAULT '{
    "enabled": true,
    "channels": ["push"],
    "offsetMinutes": [1440, 120, 0]
  }'::jsonb;

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS progress_mode VARCHAR(20) DEFAULT 'percentage' CHECK (progress_mode IN ('percentage', 'ai')),
  ADD COLUMN IF NOT EXISTS starting_value DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS progress_unit VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ai_coaching BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS checkin_config JSONB DEFAULT '{"frequency":"weekly","days":[],"time":"20:00","channels":["push"]}'::jsonb,
  ADD COLUMN IF NOT EXISTS deadline_reminder_config JSONB DEFAULT '{"enabled":true,"offsetMinutes":[10080,4320,1440],"channels":["push"]}'::jsonb;

UPDATE goals
SET progress_mode = CASE WHEN measurable THEN 'percentage' ELSE 'ai' END,
    ai_coaching = CASE WHEN measurable THEN ai_coaching ELSE TRUE END
WHERE progress_mode IS NULL OR (measurable = FALSE AND progress_mode = 'percentage' AND target_value IS NULL);

ALTER TABLE goal_checkins
  ADD COLUMN IF NOT EXISTS progress_percent DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS progress_value DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB;

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS kind VARCHAR(80),
  ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['push']::TEXT[],
  ADD COLUMN IF NOT EXISTS delivery_key TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_delivery_key_unique
  ON reminders(delivery_key)
  WHERE delivery_key IS NOT NULL;

-- The original subscribe endpoint uses ON CONFLICT(endpoint); make that invariant real.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY created_at DESC, id) AS rn
  FROM push_subscriptions
)
DELETE FROM push_subscriptions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint_unique
  ON push_subscriptions(endpoint);

CREATE TABLE IF NOT EXISTS reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  delivery_key TEXT NOT NULL UNIQUE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  channels TEXT[] NOT NULL DEFAULT ARRAY['push']::TEXT[],
  sent_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  failed_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  payload JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'sent', 'partial', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminder_deliveries_user_created_idx
  ON reminder_deliveries(user_id, created_at DESC);

ALTER TABLE reminder_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_delivery_user_isolation ON reminder_deliveries;
CREATE POLICY reminder_delivery_user_isolation ON reminder_deliveries
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS telegram_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  username VARCHAR(255),
  first_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telegram_connection_user_isolation ON telegram_connections;
CREATE POLICY telegram_connection_user_isolation ON telegram_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telegram_link_token_user_isolation ON telegram_link_tokens;
CREATE POLICY telegram_link_token_user_isolation ON telegram_link_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reminder_deliveries_touch_updated_at ON reminder_deliveries;
CREATE TRIGGER reminder_deliveries_touch_updated_at
BEFORE UPDATE ON reminder_deliveries
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS telegram_connections_touch_updated_at ON telegram_connections;
CREATE TRIGGER telegram_connections_touch_updated_at
BEFORE UPDATE ON telegram_connections
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
