-- SYNTHETIC LOCAL FIXTURES ONLY. No passwords or real financial records.
-- Stable IDs allow repeatable start; reset is the deliberate way to restore changed fixtures.
INSERT INTO auth.users(id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
 ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','routine-a@example.invalid',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','routine-b@example.invalid',now(),'{"provider":"email","providers":["email"]}','{}',now(),now())
ON CONFLICT(id) DO NOTHING;
INSERT INTO profiles(user_id,display_name,timezone) VALUES
 ('11111111-1111-4111-8111-111111111111','Synthetic A','Africa/Lagos'),
 ('22222222-2222-4222-8222-222222222222','Synthetic B','America/New_York')
ON CONFLICT(user_id) DO NOTHING;
INSERT INTO recurring_tasks(id,user_id,title,preferred_time) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','Synthetic completed routine','08:00'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111','Synthetic skipped routine','14:00'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','11111111-1111-4111-8111-111111111111','Synthetic pending routine',null),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','22222222-2222-4222-8222-222222222222','Other synthetic owner','09:00')
ON CONFLICT(id) DO NOTHING;
INSERT INTO task_schedules(task_id,weekday)
SELECT id,day FROM recurring_tasks CROSS JOIN generate_series(0,6) day
WHERE id IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')
ON CONFLICT(task_id,weekday) DO NOTHING;
INSERT INTO task_occurrences(task_id,date,status)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','2026-10-18T00:00:00Z','completed'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','2026-10-18T00:00:00Z','skipped'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','2026-10-18T00:00:00Z','pending'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','2026-10-18T00:00:00Z','completed')
ON CONFLICT(task_id,date) DO NOTHING;
