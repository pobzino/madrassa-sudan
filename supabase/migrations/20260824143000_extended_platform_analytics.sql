create or replace function public.get_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  start_day date;
  result jsonb;
begin
  start_day := current_date - (safe_days - 1);

  with filtered as (
    select event_name, path, locale, properties, created_at
    from public.analytics_events
    where created_at >= start_day::timestamptz
  ),
  calendar as (
    select generate_series(start_day, current_date, interval '1 day')::date as day
  ),
  daily as (
    select
      calendar.day,
      count(filtered.*) filter (where filtered.event_name = 'page_view')::integer as page_views,
      count(filtered.*) filter (
        where filtered.event_name = 'page_view'
          and filtered.properties->>'section' in ('public', 'auth')
      )::integer as public_page_views,
      count(filtered.*) filter (
        where filtered.event_name = 'page_view'
          and filtered.properties->>'section' in ('student', 'teacher', 'admin')
      )::integer as platform_page_views,
      count(filtered.*) filter (where filtered.event_name = 'signup_click')::integer as signup_clicks
    from calendar
    left join filtered on filtered.created_at::date = calendar.day
    group by calendar.day
    order by calendar.day
  ),
  top_pages as (
    select
      path,
      coalesce(properties->>'section', 'unknown') as section,
      count(*)::integer as views
    from filtered
    where event_name = 'page_view'
    group by path, coalesce(properties->>'section', 'unknown')
    order by views desc, path
    limit 10
  ),
  top_events as (
    select event_name, count(*)::integer as count
    from filtered
    where event_name <> 'page_view'
    group by event_name
    order by count desc, event_name
    limit 15
  ),
  page_sections as (
    select coalesce(properties->>'section', 'unknown') as section, count(*)::integer as views
    from filtered
    where event_name = 'page_view'
    group by coalesce(properties->>'section', 'unknown')
    order by views desc, section
  ),
  acquisition_sources as (
    select
      coalesce(nullif(properties->>'acquisition_source', ''), 'direct') as source,
      count(*)::integer as visits
    from filtered
    where event_name = 'landing_view'
    group by coalesce(nullif(properties->>'acquisition_source', ''), 'direct')
    order by visits desc, source
    limit 10
  ),
  reliability as (
    select
      event_name,
      coalesce(nullif(properties->>'error_type', ''), 'unknown') as error_type,
      coalesce(nullif(properties->>'media_type', ''), 'other') as media_type,
      count(*)::integer as count
    from filtered
    where event_name in ('media_error', 'application_error', 'signup_error')
    group by event_name, coalesce(nullif(properties->>'error_type', ''), 'unknown'), coalesce(nullif(properties->>'media_type', ''), 'other')
    order by count desc, event_name, error_type
    limit 12
  )
  select jsonb_build_object(
    'range_days', safe_days,
    'totals', jsonb_build_object(
      'page_views', count(*) filter (where event_name = 'page_view'),
      'public_page_views', count(*) filter (
        where event_name = 'page_view' and properties->>'section' in ('public', 'auth')
      ),
      'platform_page_views', count(*) filter (
        where event_name = 'page_view' and properties->>'section' in ('student', 'teacher', 'admin')
      ),
      'landing_views', count(*) filter (where event_name = 'landing_view'),
      'homepage_views', count(*) filter (where event_name = 'page_view' and path = '/'),
      'sample_lesson_views', count(*) filter (where event_name = 'page_view' and path = '/sample-lesson'),
      'signup_starts', count(*) filter (where event_name = 'signup_start'),
      'signup_clicks', count(*) filter (where event_name = 'signup_click'),
      'signup_completions', count(*) filter (where event_name = 'signup_complete'),
      'application_starts', count(*) filter (where event_name = 'application_start'),
      'application_submissions', count(*) filter (where event_name = 'application_submit'),
      'sample_practice_starts', count(*) filter (where event_name = 'sample_practice_start'),
      'sample_practice_completions', count(*) filter (where event_name = 'sample_practice_complete'),
      'reliability_errors', count(*) filter (
        where event_name in ('media_error', 'application_error', 'signup_error')
      )
    ),
    'learning', jsonb_build_object(
      'lesson_starts', count(*) filter (where event_name = 'lesson_start'),
      'video_starts', count(*) filter (where event_name = 'lesson_video_start'),
      'video_completions', count(*) filter (where event_name = 'lesson_video_complete'),
      'practice_starts', count(*) filter (where event_name = 'practice_start'),
      'practice_submissions', count(*) filter (where event_name = 'practice_submit'),
      'practice_passes', count(*) filter (where event_name = 'practice_pass'),
      'practice_failures', count(*) filter (where event_name = 'practice_fail'),
      'practice_retries', count(*) filter (where event_name = 'practice_retry'),
      'next_lessons_opened', count(*) filter (where event_name = 'next_lesson_open')
    ),
    'daily', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', day,
        'page_views', page_views,
        'public_page_views', public_page_views,
        'platform_page_views', platform_page_views,
        'signup_clicks', signup_clicks
      ) order by day) from daily),
      '[]'::jsonb
    ),
    'top_pages', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'path', path,
        'section', section,
        'views', views
      ) order by views desc, path) from top_pages),
      '[]'::jsonb
    ),
    'top_events', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'count', count
      ) order by count desc, event_name) from top_events),
      '[]'::jsonb
    ),
    'page_sections', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'section', section,
        'views', views
      ) order by views desc, section) from page_sections),
      '[]'::jsonb
    ),
    'acquisition_sources', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'source', source,
        'visits', visits
      ) order by visits desc, source) from acquisition_sources),
      '[]'::jsonb
    ),
    'reliability', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'event_name', event_name,
        'error_type', error_type,
        'media_type', media_type,
        'count', count
      ) order by count desc, event_name, error_type) from reliability),
      '[]'::jsonb
    )
  ) into result
  from filtered;

  return result;
end;
$$;

revoke all on function public.get_analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.get_analytics_summary(integer) to service_role;

create or replace function public.get_product_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  start_at timestamptz;
  result jsonb;
begin
  start_at := date_trunc('day', now()) - ((safe_days - 1) * interval '1 day');

  with active_learners as (
    select distinct student_id
    from public.lesson_progress
    where updated_at >= start_at
    union
    select distinct student_id
    from public.homework_attempts
    where submitted_at >= start_at
  ),
  returning_learners as (
    select active.student_id
    from active_learners active
    where exists (
      select 1 from public.lesson_progress prior
      where prior.student_id = active.student_id and prior.created_at < start_at
    ) or exists (
      select 1 from public.homework_attempts prior_attempt
      where prior_attempt.student_id = active.student_id and prior_attempt.submitted_at < start_at
    )
  ),
  practice_attempts as (
    select
      attempt.attempt_number,
      attempt.score,
      attempt.max_score,
      assignment.passing_score
    from public.homework_attempts attempt
    join public.homework_assignments assignment on assignment.id = attempt.assignment_id
    where assignment.is_practice = true
      and attempt.submitted_at >= start_at
  ),
  top_lessons as (
    select
      lesson.id,
      lesson.title_ar,
      lesson.title_en,
      count(*) filter (where progress.created_at >= start_at)::integer as starts,
      count(*) filter (where progress.completed_at >= start_at)::integer as completions
    from public.lesson_progress progress
    join public.lessons lesson on lesson.id = progress.lesson_id
    where progress.created_at >= start_at or progress.completed_at >= start_at
    group by lesson.id, lesson.title_ar, lesson.title_en
    order by completions desc, starts desc, lesson.title_en
    limit 8
  )
  select jsonb_build_object(
    'range_days', safe_days,
    'registrations', (select count(*) from public.profiles where created_at >= start_at),
    'parent_applications', (select count(*) from public.parent_applications where created_at >= start_at),
    'volunteer_applications', (select count(*) from public.volunteer_applications where created_at >= start_at),
    'active_learners', (select count(*) from active_learners),
    'returning_learners', (select count(*) from returning_learners),
    'lessons_started', (select count(*) from public.lesson_progress where created_at >= start_at),
    'lesson_completions', (select count(*) from public.lesson_progress where completed_at >= start_at),
    'practice_attempts', (select count(*) from practice_attempts),
    'practice_passes', (
      select count(*) from practice_attempts
      where score is not null and max_score > 0
        and (score::numeric / max_score) * 100 >= passing_score
    ),
    'practice_failures', (
      select count(*) from practice_attempts
      where score is not null and max_score > 0
        and (score::numeric / max_score) * 100 < passing_score
    ),
    'practice_retries', (select count(*) from practice_attempts where attempt_number > 1),
    'average_practice_score', coalesce((
      select round(avg((score::numeric / nullif(max_score, 0)) * 100), 1)
      from practice_attempts
      where score is not null and max_score > 0
    ), 0),
    'top_lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'title_ar', title_ar,
        'title_en', title_en,
        'starts', starts,
        'completions', completions
      ) order by completions desc, starts desc, title_en)
      from top_lessons
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_product_analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.get_product_analytics_summary(integer) to service_role;
