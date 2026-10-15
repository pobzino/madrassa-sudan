-- =============================================================================
-- Streaks count the day a lesson was finished, not the day it reached us
-- =============================================================================
-- bump_lesson_streak_on_completion (20260610000000) credited every completion
-- to the server's today. Lessons finished offline are sent when the phone is
-- back online, often days later, so a family that learned Monday to Thursday
-- and synced on Friday got a streak of 1. lesson_progress.completed_at already
-- holds the phone's completion time (the offline sync sends it, and the
-- 20261016120000 lockdown keeps it, never in the future); this version reads
-- it.
--
--   * The activity day is completed_at's UTC date (UTC like the homework
--     submit route and the streak reminders), clamped to the last 14 days so
--     a completion can't invent far-back days.
--   * A newer day extends the streak when it follows the last active day,
--     otherwise starts a new one; the same day keeps it.
--   * An older day arriving late (lessons synced out of order, a second
--     phone) leaves last_activity_date alone and recounts the run of
--     consecutive completion days ending at the last active day, so filling
--     a gap joins the streak back up. The streak never goes down here.
--
-- Still SECURITY DEFINER and still fires only when completed goes from false
-- to true (trg_lesson_progress_streak is unchanged). Written to sit on top of
-- 20261016120000 (which keeps a completion permanent, so re-completing can't
-- count twice), and safe without it: the day is clamped here either way.
-- =============================================================================

create or replace function public.bump_lesson_streak_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_day        date;
  v_last       date;
  v_current    int;
  v_longest    int;
  v_new_streak int;
  v_run        int;
begin
  -- Only act when a lesson newly transitions into a completed state.
  if NEW.completed is not true then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.completed is true then
    return NEW;
  end if;

  v_day := (greatest(least(coalesce(NEW.completed_at, v_now), v_now), v_now - interval '14 days')
            at time zone 'utc')::date;

  select last_activity_date, current_streak_days, longest_streak_days
    into v_last, v_current, v_longest
  from public.student_streaks
  where student_id = NEW.student_id
  for update;

  if not found then
    insert into public.student_streaks (
      student_id, current_streak_days, longest_streak_days,
      last_activity_date, total_lessons_completed, total_homework_completed
    ) values (NEW.student_id, 1, 1, v_day, 1, 0);
    return NEW;
  end if;

  if v_last is null or v_day > v_last then
    if v_last is not null and v_day = v_last + 1 then
      v_new_streak := coalesce(v_current, 0) + 1;
    else
      v_new_streak := 1;
    end if;

    update public.student_streaks set
      current_streak_days     = v_new_streak,
      longest_streak_days     = greatest(coalesce(v_longest, 0), v_new_streak),
      last_activity_date      = v_day,
      total_lessons_completed = total_lessons_completed + 1,
      updated_at              = now()
    where student_id = NEW.student_id;
    return NEW;
  end if;

  if v_day = v_last then
    v_new_streak := greatest(coalesce(v_current, 0), 1);
  else
    -- Consecutive days ending at v_last among this student's completion days
    -- (this row included): in descending order, a day belongs to the run
    -- while its distance from v_last equals its position.
    select count(*)::int into v_run
    from (
      select d, (v_last - d) as distance, (row_number() over (order by d desc) - 1) as position
      from (
        select (lp.completed_at at time zone 'utc')::date as d
        from public.lesson_progress lp
        where lp.student_id = NEW.student_id
          and lp.completed is true
          and lp.completed_at is not null
        union
        select v_day
        union
        select v_last
      ) days
      where d <= v_last
    ) ranked
    where distance = position;

    v_new_streak := greatest(coalesce(v_current, 0), v_run);
  end if;

  update public.student_streaks set
    current_streak_days     = v_new_streak,
    longest_streak_days     = greatest(coalesce(v_longest, 0), v_new_streak),
    total_lessons_completed = total_lessons_completed + 1,
    updated_at              = now()
  where student_id = NEW.student_id;

  return NEW;
end;
$$;
