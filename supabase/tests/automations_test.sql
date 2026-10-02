-- Run after supabase_stub.sql + migrations. Raises an exception on any failure.
\set ON_ERROR_STOP 1
insert into public.team_members (email) values ('team@example.com');

set role authenticated;
select set_config('request.jwt.claims', '{"email":"Team@Example.com"}', false);

do $$
declare
  lead uuid; onboard uuid; design uuid; p uuid; n int;
begin
  select id into lead from stages where name = 'Lead';
  select id into onboard from stages where name = 'Onboarding';
  select id into design from stages where name = 'Design';

  insert into clients (name, email) values ('Acme', 'a@acme.test');
  insert into projects (name, stage_id, client_id)
    values ('Acme site', lead, (select id from clients limit 1)) returning id into p;

  select count(*) into n from tasks where project_id = p;
  if n <> 2 then raise exception 'expected 2 lead tasks, got %', n; end if;

  -- Moving in creates onboarding tasks with due dates.
  update projects set stage_id = onboard where id = p;
  select count(*) into n from tasks where project_id = p and stage_id = onboard and due_date is not null;
  if n <> 4 then raise exception 'expected 4 onboarding tasks, got %', n; end if;

  -- Moving out and back does not duplicate.
  update projects set stage_id = lead where id = p;
  update projects set stage_id = onboard where id = p;
  select count(*) into n from tasks where project_id = p;
  if n <> 6 then raise exception 'expected 6 tasks after round trip, got %', n; end if;

  -- Onboarding auto-advances once its checklist is done.
  update tasks set done = true where project_id = p and stage_id = onboard;
  if (select stage_id from projects where id = p) <> design then
    raise exception 'project did not auto-advance to Design';
  end if;
  if exists (select 1 from tasks where project_id = p and done and done_at is null) then
    raise exception 'done_at not stamped';
  end if;
  select count(*) into n from tasks where project_id = p and stage_id = design;
  if n <> 4 then raise exception 'expected 4 design tasks, got %', n; end if;

  -- Lead does not auto-advance.
  insert into projects (name, stage_id) values ('Other', lead) returning id into p;
  update tasks set done = true where project_id = p;
  if (select stage_id from projects where id = p) <> lead then
    raise exception 'Lead should not auto-advance';
  end if;

  select count(*) into n from activity;
  if n < 5 then raise exception 'expected activity rows, got %', n; end if;
end;
$$;

-- Not on the team: sees nothing, can write nothing.
select set_config('request.jwt.claims', '{"email":"stranger@example.com"}', false);
do $$
begin
  if exists (select 1 from projects) or exists (select 1 from clients) then
    raise exception 'stranger can read data';
  end if;
  begin
    insert into clients (name) values ('Nope');
    raise exception 'stranger could insert';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Nobody signed in can read the Google token.
reset role;
insert into google_connection (refresh_token, email) values ('secret', 'g@example.com');
set role authenticated;
select set_config('request.jwt.claims', '{"email":"team@example.com"}', false);
do $$
begin
  if exists (select 1 from google_connection) then raise exception 'token readable'; end if;
  if (select email from google_connection_status()) <> 'g@example.com' then
    raise exception 'status function broken';
  end if;
end;
$$;
set role anon;
select set_config('request.jwt.claims', '', false);
do $$
begin
  if exists (select 1 from event_types) or exists (select 1 from bookings) then
    raise exception 'anon can read booking tables';
  end if;
end;
$$;
reset role;
-- Overlapping confirmed bookings are rejected; a cancelled one frees the slot.
do $$
begin
  insert into bookings (name, email, start_at, end_at) values ('A', 'a@x.test', '2030-01-01 10:00Z', '2030-01-01 10:30Z');
  begin
    insert into bookings (name, email, start_at, end_at) values ('B', 'b@x.test', '2030-01-01 10:15Z', '2030-01-01 10:45Z');
    raise exception 'overlap allowed';
  exception when exclusion_violation then null;
  end;
  update bookings set status = 'cancelled' where name = 'A';
  insert into bookings (name, email, start_at, end_at) values ('B', 'b@x.test', '2030-01-01 10:15Z', '2030-01-01 10:45Z');
end;
$$;
select 'ALL AUTOMATION/RLS TESTS PASSED';
