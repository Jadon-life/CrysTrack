CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, timezone text, current_timezone text);
CREATE TABLE public.recurring_tasks(id uuid PRIMARY KEY, user_id uuid NOT NULL, title text);
CREATE TABLE public.finance_targets(id uuid PRIMARY KEY, user_id uuid NOT NULL, title text,target_amount decimal(12,2),current_amount decimal(12,2));
CREATE TABLE public.goals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,title varchar(255) NOT NULL,description text,category text,deadline timestamptz,
 measurable boolean DEFAULT false,starting_value decimal(12,2),target_value decimal(10,2),progress_value decimal(10,2),progress_unit varchar(50),progress_mode varchar(20) DEFAULT 'percentage',ai_coaching boolean DEFAULT false,
 checkin_config jsonb DEFAULT '{"frequency":"daily","days":[],"time":"20:00","channels":["push"]}',deadline_reminder_config jsonb,
 status varchar(50) DEFAULT 'active',created_at timestamptz DEFAULT now(),completed_at timestamptz);
CREATE TABLE public.goal_checkins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),goal_id uuid REFERENCES goals(id) ON DELETE CASCADE,user_id uuid,progress_value decimal(12,2),progress_percent decimal(5,2),occurrence_key text,occurrence_start_date date,occurrence_end_date date);
ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_tasks ON recurring_tasks FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_targets ON finance_targets FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY own_checkins ON goal_checkins FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO recurring_tasks VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Mine'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Theirs');
INSERT INTO finance_targets VALUES('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Laptop',100,25),('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Private',100,25);
