-- Two-factor sign-in.
--
-- Team data is only readable by sessions that have entered a code from an
-- authenticator app (Supabase marks those sessions "aal2"). Every RLS policy
-- and team-only function goes through is_team_member(), so a password alone
-- can't reach any project, client or booking, even by calling the database
-- API directly.
--
-- Run this only after the app update that adds the two-factor page is live
-- and you've set up your authenticator app, or the dashboard will show no data
-- until you do.

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1 from public.team_members
      where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;
