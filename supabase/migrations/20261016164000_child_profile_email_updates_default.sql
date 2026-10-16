-- Child learner rows do not subscribe to family email updates.
-- The existing create_child_profile RPC intentionally omits this field.
ALTER TABLE public.profiles
  ALTER COLUMN email_updates_opt_in SET DEFAULT false;
