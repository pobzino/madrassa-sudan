create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (
    event_name ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  path text not null check (char_length(path) between 1 and 240),
  locale text not null default 'en' check (locale in ('ar', 'en')),
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object'
    and pg_column_size(properties) <= 2048
  ),
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_path_created_at_idx
  on public.analytics_events (path, created_at desc)
  where event_name = 'page_view';

alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from anon, authenticated;
grant all on table public.analytics_events to service_role;
grant usage, select on sequence public.analytics_events_id_seq to service_role;

comment on table public.analytics_events is
  'Cookieless aggregate product analytics. No account, IP, fingerprint, answer, or persistent visitor identifiers.';

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
    select event_name, path, properties, created_at
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
      count(filtered.*) filter (where filtered.event_name = 'signup_click')::integer as signup_clicks
    from calendar
    left join filtered on filtered.created_at::date = calendar.day
    group by calendar.day
    order by calendar.day
  ),
  top_pages as (
    select path, count(*)::integer as views
    from filtered
    where event_name = 'page_view'
    group by path
    order by views desc, path
    limit 8
  ),
  top_events as (
    select event_name, count(*)::integer as count
    from filtered
    where event_name <> 'page_view'
    group by event_name
    order by count desc, event_name
    limit 10
  )
  select jsonb_build_object(
    'range_days', safe_days,
    'totals', jsonb_build_object(
      'page_views', count(*) filter (where event_name = 'page_view'),
      'homepage_views', count(*) filter (where event_name = 'page_view' and path = '/'),
      'sample_lesson_views', count(*) filter (where event_name = 'page_view' and path = '/sample-lesson'),
      'signup_clicks', count(*) filter (where event_name = 'signup_click'),
      'signup_completions', count(*) filter (where event_name = 'signup_complete'),
      'sample_practice_starts', count(*) filter (where event_name = 'sample_practice_start'),
      'sample_practice_completions', count(*) filter (where event_name = 'sample_practice_complete')
    ),
    'daily', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'date', day,
        'page_views', page_views,
        'signup_clicks', signup_clicks
      ) order by day) from daily),
      '[]'::jsonb
    ),
    'top_pages', coalesce(
      (select jsonb_agg(jsonb_build_object('path', path, 'views', views) order by views desc, path) from top_pages),
      '[]'::jsonb
    ),
    'top_events', coalesce(
      (select jsonb_agg(jsonb_build_object('event_name', event_name, 'count', count) order by count desc, event_name) from top_events),
      '[]'::jsonb
    )
  ) into result
  from filtered;

  return result;
end;
$$;

revoke all on function public.get_analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.get_analytics_summary(integer) to service_role;
