-- CrysTrack product-integrity repair
-- Apply after 0000_initial.sql.

-- Clean duplicate schedule rows before enforcing the intended invariant.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id, weekday ORDER BY id) AS rn
  FROM task_schedules
)
DELETE FROM task_schedules
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- If duplicate occurrences exist, retain the strongest/latest record for each exact task/date pair.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY task_id, date
      ORDER BY (status = 'completed') DESC, completed_at DESC NULLS LAST, id
    ) AS rn
  FROM task_occurrences
)
DELETE FROM task_occurrences
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS task_schedule_task_weekday_unique
  ON task_schedules(task_id, weekday);

CREATE UNIQUE INDEX IF NOT EXISTS task_occurrence_task_date_unique
  ON task_occurrences(task_id, date);

-- goal_insights had RLS enabled in the initial migration but no user-isolation policy.
DROP POLICY IF EXISTS goal_insight_user_isolation ON goal_insights;
CREATE POLICY goal_insight_user_isolation ON goal_insights
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM goals g
      WHERE g.id = goal_id AND g.user_id = auth.uid()
    )
  );

-- Atomic, user-scoped savings-target increment used by the finance entry endpoint.
CREATE OR REPLACE FUNCTION increment_target(target_uuid UUID, amount_num NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF amount_num IS NULL OR amount_num <= 0 THEN
    RAISE EXCEPTION 'amount_num must be greater than zero';
  END IF;

  UPDATE finance_targets
  SET current_amount = COALESCE(current_amount, 0) + amount_num
  WHERE id = target_uuid
    AND user_id = auth.uid()
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Savings target not found or not accessible';
  END IF;
END;
$$;
