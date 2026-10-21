-- Run after 0011_require_two_factor.sql. A team member's password-only
-- session (no authenticator code yet) must not reach any team data.
\set ON_ERROR_STOP 1
reset role;
insert into public.team_members (email) values ('team@example.com') on conflict do nothing;
insert into public.clients (name) values ('Two Factor Co');

set role authenticated;

-- Password only ("aal1"): not treated as on the team.
select set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal1"}', false);
do $$
begin
  if public.is_team_member() then raise exception 'aal1 session counted as team'; end if;
  if exists (select 1 from clients) then raise exception 'aal1 session can read clients'; end if;
  begin
    insert into clients (name) values ('Nope');
    raise exception 'aal1 session could insert';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- No aal claim at all: same.
select set_config('request.jwt.claims', '{"email":"team@example.com"}', false);
do $$
begin
  if public.is_team_member() then raise exception 'session without aal counted as team'; end if;
end;
$$;

-- With an authenticator code ("aal2"): full access.
select set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal2"}', false);
do $$
begin
  if not public.is_team_member() then raise exception 'aal2 team member refused'; end if;
  if not exists (select 1 from clients where name = 'Two Factor Co') then raise exception 'aal2 session cannot read clients'; end if;
end;
$$;

-- An authenticator code doesn't make a stranger part of the team.
select set_config('request.jwt.claims', '{"email":"stranger@example.com","aal":"aal2"}', false);
do $$
begin
  if public.is_team_member() then raise exception 'stranger counted as team'; end if;
end;
$$;

reset role;
delete from public.clients where name = 'Two Factor Co';
select 'ALL TWO FACTOR TESTS PASSED';
