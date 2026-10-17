CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
CREATE TYPE public.assignment_status AS ENUM ('upcoming','due_soon','due_today','overdue','completed');
CREATE TYPE public.priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.activity_type AS ENUM ('assignment_completed');
CREATE TYPE public.reminder_status AS ENUM ('pending','sent','snoozed','cancelled');
CREATE TABLE public.assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,title varchar(255) NOT NULL,description text,
 deadline timestamptz NOT NULL,priority priority DEFAULT 'medium',status assignment_status DEFAULT 'upcoming',category varchar(100),
 completed_at timestamptz,created_at timestamptz DEFAULT now(),reminder_config jsonb
);
CREATE TABLE public.activity_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,type activity_type,entity_type text,entity_id uuid,metadata_json jsonb);
CREATE TABLE public.reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,entity_type text,entity_id uuid,status reminder_status DEFAULT 'pending');
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY assignment_user_isolation ON assignments FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_activity ON activity_events FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_reminders ON reminders FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO assignments(user_id,title,deadline,status,completed_at) VALUES('00000000-0000-4000-8000-000000000001','Historical late','2000-01-01T00:00:00Z','completed','2001-01-01T00:00:00Z');
