-- Run after 0005_admin_tasks.sql, 0012_support_tasks.sql and 0013_support_task_repeats.sql. Checks On-Demand Support tasks, their
-- subtasks, the done/invoiced stamps, repeats and that only the team can see them.
\set ON_ERROR_STOP 1
reset role;
insert into public.team_members (email) values ('team@example.com') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal2"}', false);

do $$
declare
  c uuid;
  t uuid;
begin
  insert into clients (name, company) values ('Support Person', 'Support Co') returning id into c;
  insert into support_tasks (client_id, title, tag, price, scheduled_date)
    values (c, 'Monthly site update', 'content_updates', 45, '2031-03-04') returning id into t;
  insert into support_subtasks (task_id, title, position) values (t, 'Update homepage banner', 1), (t, 'Swap team photo', 2);

  begin
    insert into support_tasks (client_id, title, tag) values (c, 'Bad tag', 'hosting');
    raise exception 'unknown tag allowed';
  exception when check_violation then null;
  end;
  begin
    insert into support_tasks (client_id, title, price) values (c, 'Negative', -1);
    raise exception 'negative price allowed';
  exception when check_violation then null;
  end;

  -- Done and invoiced are time-stamped, and cleared when unticked.
  update support_tasks set done = true where id = t;
  if (select done_at from support_tasks where id = t) is null then raise exception 'done_at not set'; end if;
  update support_tasks set invoiced = true where id = t;
  if (select invoiced_at from support_tasks where id = t) is null then raise exception 'invoiced_at not set'; end if;
  update support_tasks set done = false, invoiced = false where id = t;
  if (select done_at is not null or invoiced_at is not null from support_tasks where id = t) then
    raise exception 'stamps not cleared';
  end if;

  -- Deleting a client keeps the task (and what was billed); deleting a task removes its subtasks.
  delete from clients where id = c;
  if (select client_id from support_tasks where id = t) is not null then raise exception 'client not cleared'; end if;
  delete from support_tasks where id = t;
  if exists (select 1 from support_subtasks where task_id = t) then raise exception 'subtasks left behind'; end if;

  insert into support_tasks (title) values ('Team only');
end;
$$;

-- A repeating task makes the next one when ticked done, once.
do $$
declare
  t uuid;
  n uuid;
  today date := public.local_today();
begin
  insert into support_tasks (title, tag, price, scheduled_date, recurrence, notes)
    values ('Monthly maintenance', 'site_enhancements', 90, today, 'monthly', 'Check forms') returning id into t;
  insert into support_subtasks (task_id, title, position) values (t, 'Update plugins', 1), (t, 'Test contact form', 2);
  update support_subtasks set done = true where task_id = t;
  update support_tasks set done = true, invoiced = true where id = t;

  select id into n from support_tasks where title = 'Monthly maintenance' and not done;
  if n is null then raise exception 'next repeat not created'; end if;
  if (select scheduled_date from support_tasks where id = n) <> (today + interval '1 month')::date then
    raise exception 'next repeat on the wrong date';
  end if;
  if (select tag <> 'site_enhancements' or price <> 90 or recurrence <> 'monthly' or notes <> 'Check forms' or invoiced
      from support_tasks where id = n) then
    raise exception 'next repeat details not copied';
  end if;
  if (select count(*) from support_subtasks where task_id = n and not done) <> 2 then
    raise exception 'subtasks not copied fresh';
  end if;
  if not (select next_created from support_tasks where id = t) then raise exception 'next_created not set'; end if;

  -- Unticking and re-ticking doesn't make another.
  update support_tasks set done = false where id = t;
  update support_tasks set done = true where id = t;
  if (select count(*) from support_tasks where title = 'Monthly maintenance') <> 2 then
    raise exception 'repeat created twice';
  end if;

  -- One-off tasks don't repeat.
  insert into support_tasks (title) values ('One off') returning id into t;
  update support_tasks set done = true where id = t;
  if (select count(*) from support_tasks where title = 'One off') <> 1 then raise exception 'one-off repeated'; end if;

  begin
    insert into support_tasks (title, recurrence) values ('Bad', 'hourly');
    raise exception 'bad recurrence allowed';
  exception when check_violation then null;
  end;
  delete from support_tasks where title in ('Monthly maintenance', 'One off');
end;
$$;

-- Password-only sessions and strangers see nothing.
select set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal1"}', false);
do $$
begin
  if exists (select 1 from support_tasks) then raise exception 'aal1 session can read support tasks'; end if;
end;
$$;
select set_config('request.jwt.claims', '{"email":"stranger@example.com","aal":"aal2"}', false);
do $$
begin
  if exists (select 1 from support_tasks) then raise exception 'stranger can read support tasks'; end if;
  begin
    insert into support_tasks (title) values ('Nope');
    raise exception 'stranger could insert';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  set local role anon;
  if exists (select 1 from support_tasks) then raise exception 'anon can read support tasks'; end if;
end;
$$;
reset role;
delete from support_tasks where title = 'Team only';
select 'ALL SUPPORT TASK TESTS PASSED';
