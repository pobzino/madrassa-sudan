BEGIN;
SELECT plan(22);

-- auth.users runs the real account and pending-child triggers. The malformed
-- intake value must be ignored without blocking the account.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'child-profile-parent-a@example.test', '', now(), '{}'::jsonb,
  '{"role":"parent","full_name":"Parent A","preferred_language":"en","signup_details":{"parent":{"whatsapp_number":"+441111111111","children_count":"2","children_ages":[6,"bad",12]}}}'::jsonb,
  now(), now()
), (
  'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'child-profile-parent-b@example.test', '', now(), '{}'::jsonb,
  '{"role":"parent","full_name":"Parent B","preferred_language":"en","signup_details":{"parent":{"whatsapp_number":"+442222222222","children_count":"1","children_ages":[8]}}}'::jsonb,
  now(), now()
);

INSERT INTO public.subjects(id,name_ar,name_en) VALUES
  ('c3000000-0000-4000-8000-000000000003','اختبار','Test');
INSERT INTO public.lessons(id,subject_id,title_ar,title_en,grade_level,is_published) VALUES
  ('d4000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000003','درس اختبار','Test lesson',1,true);
INSERT INTO public.lesson_questions(id,lesson_id,question_text_ar,question_text_en,correct_answer,timestamp_seconds)
VALUES ('e5000000-0000-4000-8000-000000000005','d4000000-0000-4000-8000-000000000004','سؤال','Question','right',1);

SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001'), 2, 'signup creates one learner per valid age');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='b2000000-0000-4000-8000-000000000002'), 1, 'second family gets its own learner');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id='a1000000-0000-4000-8000-000000000001' AND auth_user_id=id), 1, 'legacy account UUID remains auth-linked');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' AND auth_user_id IS NULL AND learner_name IS NULL), 2, 'children are pending profiles without credentials');
SELECT is((SELECT cardinality(learner_profile_ids) FROM public.parent_applications WHERE auth_user_id='a1000000-0000-4000-8000-000000000001'), 2, 'signup records the intake profiles atomically');

-- Fill the family to its configured limit using the trusted migration role.
UPDATE public.profiles SET learner_name='Named child', full_name='Named child'
WHERE parent_account_id='a1000000-0000-4000-8000-000000000001';
DO $$
DECLARE i integer;
BEGIN
  FOR i IN 1..6 LOOP
    INSERT INTO public.profiles(id,full_name,learner_name,role,parent_account_id,preferred_language)
    VALUES(gen_random_uuid(),'Extra child','Extra child','student','a1000000-0000-4000-8000-000000000001','en');
  END LOOP;
END;
$$;
SELECT set_config('amal.test.child_id', (SELECT id::text FROM public.profiles
  WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' ORDER BY created_at,id LIMIT 1), true);
SELECT set_config('amal.test.foreign_child_id', (SELECT id::text FROM public.profiles
  WHERE parent_account_id='b2000000-0000-4000-8000-000000000002' ORDER BY created_at,id LIMIT 1), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT ok(public.can_access_learner((SELECT id FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' ORDER BY created_at,id LIMIT 1)), 'parent can access direct child');
SELECT ok(NOT public.can_access_learner((SELECT id FROM public.profiles WHERE parent_account_id='b2000000-0000-4000-8000-000000000002' LIMIT 1)), 'parent cannot access foreign child UUID');
SELECT is(jsonb_array_length(public.consume_suggested_children()),2,'repeated intake consumption returns the same learners');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001'),8,'consuming signup intake does not create duplicate profiles');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='b2000000-0000-4000-8000-000000000002'), 0, 'RLS hides another family profiles');
SELECT lives_ok(
  $$INSERT INTO public.lesson_progress(student_id,lesson_id,last_position_seconds,questions_correct,quiz_passed,interactive_slides_correct)
    VALUES(current_setting('amal.test.child_id')::uuid,'d4000000-0000-4000-8000-000000000004',33,99,true,99)$$,
  'parent can write progress for an owned child'
);
SELECT is((SELECT count(*)::integer FROM public.lesson_progress
  WHERE student_id=current_setting('amal.test.child_id')::uuid AND lesson_id='d4000000-0000-4000-8000-000000000004'
    AND last_position_seconds=33 AND questions_correct=0 AND quiz_passed=false AND interactive_slides_correct=0),1,
  'progress writes cannot forge quiz scores or pass state');
SELECT lives_ok(
  $$INSERT INTO public.lesson_question_responses(student_id,question_id,answer,is_correct)
    VALUES(current_setting('amal.test.child_id')::uuid,'e5000000-0000-4000-8000-000000000005','wrong',true)$$,
  'parent can submit an answer for an owned child'
);
SELECT is((SELECT count(*)::integer FROM public.lesson_question_responses
  WHERE student_id=current_setting('amal.test.child_id')::uuid AND question_id='e5000000-0000-4000-8000-000000000005'
    AND answer='wrong' AND is_correct=false),1,
  'child answer write cannot forge correctness');
SELECT throws_ok(
  $$INSERT INTO public.lesson_question_responses(student_id,question_id,answer,is_correct)
    VALUES(current_setting('amal.test.foreign_child_id')::uuid,'e5000000-0000-4000-8000-000000000005','answer',false)$$,
  '42501','new row violates row-level security policy for table "lesson_question_responses"',
  'parent cannot submit an answer for another family learner'
);
SELECT throws_ok(
  $$INSERT INTO public.lesson_progress(student_id,lesson_id,last_position_seconds)
    VALUES(current_setting('amal.test.foreign_child_id')::uuid,'d4000000-0000-4000-8000-000000000004',33)$$,
  '42501','new row violates row-level security policy for table "lesson_progress"',
  'parent cannot write another family learner progress'
);
SELECT throws_ok(
  $$SELECT public.create_child_profile('Ninth child', 9, NULL)$$,
  '23514', 'child profile limit reached', 'atomically rejects the ninth child'
);

RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' AND grade_level IN (1,7)), 2, 'signup ages map to clamped school grades');
DELETE FROM public.profiles WHERE id=current_setting('amal.test.child_id')::uuid;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id='a1000000-0000-4000-8000-000000000001'), 1, 'deleting a child preserves its parent account');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001'), 7, 'deleting a child removes only that child profile');
SELECT is((SELECT count(*)::integer FROM public.lesson_progress WHERE lesson_id='d4000000-0000-4000-8000-000000000004'), 0, 'deleting a child cascades its progress');
SELECT is((SELECT count(*)::integer FROM public.lesson_question_responses WHERE question_id='e5000000-0000-4000-8000-000000000005'), 0, 'deleting a child cascades its quiz responses');
SELECT is((SELECT count(*)::integer FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid='public.profiles'::regclass AND a.attname='student_id' AND c.confdeltype<>'c'),0,'all student-owned profile foreign keys cascade on deletion');

SELECT * FROM finish();
ROLLBACK;
