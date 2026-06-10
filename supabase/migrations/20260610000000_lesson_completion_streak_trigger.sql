-- =============================================================================
-- Lesson completion -> student_streaks trigger
-- =============================================================================
-- The student lesson/sim player writes lesson_progress.completed directly via
-- the Supabase client (handleSimProgress auto-complete at 80%, handleMarkComplete,
-- and the offline sync queue). Those paths bypassed the /api/lesson-progress
-- route that used to bump student_streaks, so total_lessons_completed never
-- moved -- which broke achievements ("Complete your first lesson"), the points
-- total, and the dashboard stats.
--
-- A trigger makes the streak update happen no matter which path writes the
-- completion, so there is a single source of truth. The /api/lesson-progress
-- route's manual lesson increment is removed in the same change to avoid
-- double counting.
-- =============================================================================

create or replace function public.bump_lesson_streak_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_last  date;
  v_current int;
  v_longest int;
  v_new_streak int;
begin
  -- Only act when a lesson newly transitions into a completed state.
  if NEW.completed is not true then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.completed is true then
    return NEW;
  end if;

  select last_activity_date, current_streak_days, longest_streak_days
    into v_last, v_current, v_longest
  from public.student_streaks
  where student_id = NEW.student_id;

  if not found then
    insert into public.student_streaks (
      student_id, current_streak_days, longest_streak_days,
      last_activity_date, total_lessons_completed, total_homework_completed
    ) values (NEW.student_id, 1, 1, v_today, 1, 0);
    return NEW;
  end if;

  if v_last = v_today then
    v_new_streak := greatest(v_current, 1);
  elsif v_last = v_today - 1 then
    v_new_streak := v_current + 1;
  else
    v_new_streak := 1;
  end if;

  update public.student_streaks set
    current_streak_days     = v_new_streak,
    longest_streak_days     = greatest(v_longest, v_new_streak),
    last_activity_date      = v_today,
    total_lessons_completed = total_lessons_completed + 1,
    updated_at              = now()
  where student_id = NEW.student_id;

  return NEW;
end;
$$;

drop trigger if exists trg_lesson_progress_streak on public.lesson_progress;
create trigger trg_lesson_progress_streak
after insert or update of completed on public.lesson_progress
for each row
when (NEW.completed is true)
execute function public.bump_lesson_streak_on_completion();

-- Backfill completions that the old client-side path already missed, so students
-- who finished lessons before this fix immediately see their achievements/points.
insert into public.student_streaks (student_id, total_lessons_completed)
select student_id, count(*)
from public.lesson_progress
where completed is true
group by student_id
on conflict (student_id) do update
  set total_lessons_completed = greatest(
        public.student_streaks.total_lessons_completed,
        excluded.total_lessons_completed
      ),
      updated_at = now();
