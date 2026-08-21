-- CrysTrack Intelligence Layer
-- Apply once after 0004_profile_avatar_storage.sql.
-- Adds goal-occurrence enforcement, AI insight/chat persistence, and an atomic Telegram relink helper.

ALTER TABLE goal_checkins
  ADD COLUMN IF NOT EXISTS occurrence_key TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_start_date DATE,
  ADD COLUMN IF NOT EXISTS occurrence_end_date DATE;

-- Preserve every historical row, but designate at most one historical check-in as
-- the canonical evidence for each occurrence. Duplicate historical rows stay intact
-- with occurrence_key = NULL, so the new uniqueness rule does not delete or rewrite them.
WITH historical AS (
  SELECT
    gc.id,
    gc.user_id,
    gc.goal_id,
    gc.created_at,
    (gc.created_at AT TIME ZONE COALESCE(tz.name, 'UTC'))::date AS local_date,
    COALESCE(g.checkin_config->>'frequency', 'weekly') AS frequency,
    CASE
      WHEN jsonb_typeof(g.checkin_config->'days') = 'array' THEN g.checkin_config->'days'
      ELSE '[]'::jsonb
    END AS days
  FROM goal_checkins gc
  JOIN goals g ON g.id = gc.goal_id AND g.user_id = gc.user_id
  LEFT JOIN profiles p ON p.user_id = gc.user_id
  LEFT JOIN pg_timezone_names tz
    ON tz.name = COALESCE(NULLIF(p.current_timezone, ''), NULLIF(p.timezone, ''), 'UTC')
  WHERE gc.occurrence_key IS NULL
), keyed AS (
  SELECT
    historical.*,
    CASE
      WHEN frequency = 'daily' THEN local_date
      WHEN frequency = 'specific' AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(days) AS item(day_value)
        WHERE day_value ~ '^[0-6]$'
          AND day_value::int = EXTRACT(DOW FROM local_date)::int
      ) THEN local_date
      WHEN frequency NOT IN ('daily', 'specific') THEN
        local_date - (
          (
            EXTRACT(DOW FROM local_date)::int
            - COALESCE(
                CASE
                  WHEN jsonb_typeof(days) = 'array'
                    AND jsonb_array_length(days) > 0
                    AND (days->>0) ~ '^[0-6]$'
                  THEN (days->>0)::int
                END,
                EXTRACT(DOW FROM local_date)::int
              )
            + 7
          ) % 7
        )
      ELSE NULL
    END AS occurrence_start
  FROM historical
), prepared AS (
  SELECT
    keyed.*,
    CASE
      WHEN occurrence_start IS NULL THEN NULL
      WHEN frequency = 'daily' THEN 'daily:' || occurrence_start::text
      WHEN frequency = 'specific' THEN 'specific:' || occurrence_start::text
      ELSE 'weekly:' || occurrence_start::text
    END AS canonical_key,
    CASE
      WHEN occurrence_start IS NULL THEN NULL
      WHEN frequency NOT IN ('daily', 'specific') THEN occurrence_start + 6
      ELSE occurrence_start
    END AS occurrence_end
  FROM keyed
), ranked AS (
  SELECT
    prepared.*,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, goal_id, canonical_key
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM prepared
  WHERE canonical_key IS NOT NULL
)
UPDATE goal_checkins gc
SET
  occurrence_key = ranked.canonical_key,
  occurrence_start_date = ranked.occurrence_start,
  occurrence_end_date = ranked.occurrence_end
FROM ranked
WHERE gc.id = ranked.id
  AND ranked.rn = 1
  AND gc.occurrence_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS goal_checkins_occurrence_unique
  ON goal_checkins(user_id, goal_id, occurrence_key)
  WHERE occurrence_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS goal_checkins_user_goal_occurrence_idx
  ON goal_checkins(user_id, goal_id, occurrence_start_date DESC)
  WHERE occurrence_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_domain_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain VARCHAR(24) NOT NULL CHECK (domain IN ('tasks', 'goals', 'assignments', 'wealth', 'overview')),
  data_fingerprint TEXT NOT NULL,
  insight JSONB NOT NULL,
  model VARCHAR(120) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain, data_fingerprint)
);

CREATE INDEX IF NOT EXISTS ai_domain_insights_user_domain_idx
  ON ai_domain_insights(user_id, domain, generated_at DESC);

ALTER TABLE ai_domain_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_domain_insight_user_isolation ON ai_domain_insights;
CREATE POLICY ai_domain_insight_user_isolation ON ai_domain_insights
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx
  ON ai_conversations(user_id, updated_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_conversation_user_isolation ON ai_conversations;
CREATE POLICY ai_conversation_user_isolation ON ai_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON ai_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ai_messages_user_created_idx
  ON ai_messages(user_id, created_at DESC);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_message_user_isolation ON ai_messages;
CREATE POLICY ai_message_user_isolation ON ai_messages
  FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM ai_conversations conversation
      WHERE conversation.id = ai_messages.conversation_id
        AND conversation.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM ai_conversations conversation
      WHERE conversation.id = ai_messages.conversation_id
        AND conversation.user_id = auth.uid()
    )
  );

-- The webhook proves possession of both a valid CrysTrack link token and the Telegram chat.
-- This helper moves a Telegram chat safely from an old CrysTrack account if necessary,
-- then links it to the account that created the active token.
CREATE OR REPLACE FUNCTION link_telegram_connection(
  p_user_id UUID,
  p_chat_id TEXT,
  p_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL
)
RETURNS telegram_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection telegram_connections;
BEGIN
  IF p_user_id IS NULL OR p_chat_id IS NULL OR btrim(p_chat_id) = '' THEN
    RAISE EXCEPTION 'Invalid Telegram link request';
  END IF;

  DELETE FROM telegram_connections
  WHERE chat_id = p_chat_id
    AND user_id <> p_user_id;

  INSERT INTO telegram_connections (
    user_id,
    chat_id,
    username,
    first_name,
    is_active,
    connected_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_chat_id,
    NULLIF(btrim(COALESCE(p_username, '')), ''),
    NULLIF(btrim(COALESCE(p_first_name, '')), ''),
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    chat_id = EXCLUDED.chat_id,
    username = EXCLUDED.username,
    first_name = EXCLUDED.first_name,
    is_active = TRUE,
    connected_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO v_connection;

  RETURN v_connection;
END;
$$;

REVOKE ALL ON FUNCTION link_telegram_connection(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION link_telegram_connection(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION link_telegram_connection(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION link_telegram_connection(UUID, TEXT, TEXT, TEXT) TO service_role;
