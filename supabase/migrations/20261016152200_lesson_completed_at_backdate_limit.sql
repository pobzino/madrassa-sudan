-- =============================================================================
-- lesson_progress.completed_at: a client may back-date a completion by at
-- most 14 days
-- =============================================================================
-- The offline sync sends the phone's completion time, clamped on the phone to
-- the last 14 days. That clamp uses the phone's clock, so a phone whose clock
-- is weeks or months behind (set by hand, or a cheap phone that lost power)
-- writes completion dates far in the past; the online lesson page writes the
-- phone's time with no clamp at all. 20261016120000 stops future dates only.
-- Weekly digests, impact counts and the tutor read completed_at, so here the
-- server is the authority: a completion time a student's own session writes
-- is never older than now() - 14 days.
--
-- A separate BEFORE trigger rather than an edit of
-- guard_lesson_progress_client_write: triggers fire in name order, so this one
-- runs after that guard (g < l) and bounds the time it settled on. It only
-- touches a completion time that is being set or changed, so a stored one
-- (which the guard keeps once a lesson is complete) is never rewritten.
-- Service-role writes and SECURITY DEFINER functions pass through, as in the
-- guard. Safe to apply before or after 20261016120000.
-- =============================================================================

SET LOCAL lock_timeout = '3s';

-- SECURITY INVOKER on purpose: current_user identifies a student's own session.
create or replace function public.limit_lesson_completed_at_backdate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;
  if NEW.completed_at is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.completed_at is not distinct from OLD.completed_at then
    return NEW;
  end if;

  NEW.completed_at := greatest(NEW.completed_at, now() - interval '14 days');
  return NEW;
end;
$$;

drop trigger if exists lesson_progress_limit_completed_at_backdate on public.lesson_progress;
create trigger lesson_progress_limit_completed_at_backdate
  before insert or update on public.lesson_progress
  for each row
  execute function public.limit_lesson_completed_at_backdate();
