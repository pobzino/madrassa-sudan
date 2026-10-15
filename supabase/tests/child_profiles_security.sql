BEGIN;
SELECT plan(11);

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

SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001'), 2, 'signup creates one learner per valid age');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='b2000000-0000-4000-8000-000000000002'), 1, 'second family gets its own learner');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id='a1000000-0000-4000-8000-000000000001' AND auth_user_id=id), 1, 'legacy account UUID remains auth-linked');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' AND auth_user_id IS NULL AND learner_name IS NULL), 2, 'children are pending profiles without credentials');

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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT ok(public.can_access_learner((SELECT id FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' ORDER BY created_at,id LIMIT 1)), 'parent can access direct child');
SELECT ok(NOT public.can_access_learner((SELECT id FROM public.profiles WHERE parent_account_id='b2000000-0000-4000-8000-000000000002' LIMIT 1)), 'parent cannot access foreign child UUID');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='b2000000-0000-4000-8000-000000000002'), 0, 'RLS hides another family profiles');
SELECT throws_ok(
  $$SELECT public.create_child_profile('Ninth child', 9, NULL)$$,
  '23514', 'child profile limit reached', 'atomically rejects the ninth child'
);

RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' AND grade_level IN (1,7)), 2, 'signup ages map to clamped school grades');
DELETE FROM public.profiles WHERE id=(SELECT id FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001' ORDER BY created_at,id LIMIT 1);
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id='a1000000-0000-4000-8000-000000000001'), 1, 'deleting a child preserves its parent account');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE parent_account_id='a1000000-0000-4000-8000-000000000001'), 7, 'deleting a child removes only that child profile');

SELECT * FROM finish();
ROLLBACK;
