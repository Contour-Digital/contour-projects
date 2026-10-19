-- Run after automations_test.sql with 0006_ad_hoc_meetings.sql applied.
-- Checks ad hoc meetings, the overlap rule and the Google connection status.
\set ON_ERROR_STOP 1
reset role;
insert into public.team_members (email) values ('team@example.com') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claims', '{"email":"team@example.com"}', false);

do $$
declare
  t1 uuid; t2 uuid;
begin
  insert into bookings (name, email, start_at, end_at) values ('Pub', 'p@x.test', '2031-01-01 10:00Z', '2031-01-01 10:30Z');
  -- Ad hoc meetings can overlap anything, and need no email.
  insert into bookings (source, title, name, start_at, end_at)
    values ('ad_hoc', 'Handover', 'No Email', '2031-01-01 10:00Z', '2031-01-01 11:00Z');
  -- Two public bookings still can't overlap.
  begin
    insert into bookings (name, email, start_at, end_at) values ('Pub2', 'q@x.test', '2031-01-01 10:15Z', '2031-01-01 10:45Z');
    raise exception 'public overlap allowed';
  exception when exclusion_violation then null;
  end;
  begin
    insert into bookings (source, name, start_at, end_at) values ('phone', 'X', '2032-01-01 10:00Z', '2032-01-01 10:30Z');
    raise exception 'bad source allowed';
  exception when check_violation then null;
  end;
  -- Every meeting gets its own calendar link token.
  select calendar_token into t1 from bookings where name = 'Pub';
  select calendar_token into t2 from bookings where name = 'No Email';
  if t1 is null or t1 = t2 then
    raise exception 'calendar tokens missing or shared';
  end if;
  if (select confirmation_body from booking_settings) not like '%{{first_name}}%' then
    raise exception 'default confirmation template missing';
  end if;
end;
$$;

-- can_send_email follows the Gmail permission.
reset role;
insert into google_connection (id, email, refresh_token, scopes)
  values (1, 'nick@example.com', 'r', 'openid email https://www.googleapis.com/auth/calendar.events')
  on conflict (id) do update set scopes = excluded.scopes;
set role authenticated;
do $$
begin
  if (select can_send_email from google_connection_status()) then
    raise exception 'can_send_email true without gmail.send';
  end if;
end;
$$;
reset role;
update google_connection set scopes = scopes || ' https://www.googleapis.com/auth/gmail.send';
set role authenticated;
do $$
begin
  if not (select can_send_email from google_connection_status()) then
    raise exception 'can_send_email false with gmail.send';
  end if;
end;
$$;
reset role;
-- The anon role still can't see the connection status.
do $$
begin
  set local role anon;
  perform google_connection_status();
  raise exception 'anon can call google_connection_status';
exception when insufficient_privilege then null;
end;
$$;
reset role;
select 'ALL AD HOC MEETING TESTS PASSED';
