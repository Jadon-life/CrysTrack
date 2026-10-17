ALTER TABLE recurring_tasks ADD COLUMN active boolean DEFAULT true,ADD COLUMN archived_at timestamptz;
CREATE TYPE public.activity_type AS ENUM ('task_completed');
CREATE TABLE public.activity_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type activity_type,entity_type text,entity_id uuid,metadata_json jsonb);
CREATE TABLE public.assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,deadline timestamptz,status text DEFAULT 'upcoming');
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO profiles(user_id,timezone) VALUES('00000000-0000-4000-8000-000000000001','Africa/Lagos');
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_activity ON activity_events FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON activity_events TO authenticated;
