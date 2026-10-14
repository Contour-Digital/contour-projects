-- Security hardening from the Supabase advisor.
--
-- Trigger functions are never meant to be called over the API. Postgres runs
-- triggers without checking EXECUTE, so revoking it changes nothing for them.
revoke execute on function public.apply_stage_templates() from public, anon, authenticated;
revoke execute on function public.maybe_auto_advance() from public, anon, authenticated;
revoke execute on function public.projects_before_stage_change() from public, anon, authenticated;
revoke execute on function public.tasks_before_done() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Signed-in users need these (RLS policies and the settings page call them);
-- signed-out visitors don't.
revoke execute on function public.is_team_member() from public, anon;
revoke execute on function public.google_connection_status() from public, anon;
revoke execute on function public.local_today() from public, anon;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.google_connection_status() to authenticated;
grant execute on function public.local_today() to authenticated;

alter function public.local_today() set search_path = public;
alter function public.projects_before_stage_change() set search_path = public;
alter function public.tasks_before_done() set search_path = public;
alter function public.set_updated_at() set search_path = public;
