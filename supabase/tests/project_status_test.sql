-- Run after 0014_project_status.sql. Checks project and support task status:
-- the default, finished stages, checklist items that set a status, and the log.
\set ON_ERROR_STOP 1
reset role;
insert into public.team_members (email) values ('team@example.com') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal2"}', false);

do $$
declare
  lead uuid; onboard uuid; launch uuid; done_stage uuid; p uuid; tmpl uuid; t uuid; st uuid; n int;
begin
  select id into lead from stages where name = 'Lead';
  select id into onboard from stages where name = 'Onboarding';
  select id into launch from stages where name = 'Launch';
  select id into done_stage from stages where is_closed limit 1;

  insert into projects (name, stage_id) values ('Status site', lead) returning id into p;
  if (select status from projects where id = p) <> 'underway' then raise exception 'default status should be underway'; end if;

  begin
    update projects set status = 'blocked' where id = p;
    raise exception 'unknown status allowed';
  exception when check_violation then null;
  end;

  update projects set status = 'on_hold' where id = p;
  if not exists (select 1 from activity where project_id = p and message = 'Status changed to On Hold') then
    raise exception 'status change not logged';
  end if;

  -- Moving between open stages keeps the status.
  update projects set stage_id = launch where id = p;
  if (select status from projects where id = p) <> 'on_hold' then raise exception 'stage move changed status'; end if;

  -- Entering a finished stage completes it; leaving reopens it as Underway.
  update projects set stage_id = done_stage where id = p;
  if (select status from projects where id = p) <> 'completed' then raise exception 'finished stage did not complete'; end if;
  update projects set stage_id = launch where id = p;
  if (select status from projects where id = p) <> 'underway' then raise exception 'leaving finished stage did not reopen'; end if;

  -- Created straight into a finished stage.
  insert into projects (name, stage_id) values ('Already done', done_stage) returning id into t;
  if (select status from projects where id = t) <> 'completed' then raise exception 'insert into finished stage not completed'; end if;

  -- A checklist item that sets a status, ticked on a project already in the stage.
  insert into stage_task_templates (stage_id, title, position, sets_status)
    values (launch, 'Send ''6-Month Website Performance Review'' Email', 9, 'waiting_on_client') returning id into tmpl;
  insert into tasks (project_id, stage_id, template_id, title) values (p, launch, tmpl, 'Send review email') returning id into t;
  update tasks set done = true where id = t;
  if (select status from projects where id = p) <> 'waiting_on_client' then raise exception 'checklist item did not set status'; end if;

  -- Unticking leaves it; a different status set by hand stays until ticked again.
  update tasks set done = false where id = t;
  if (select status from projects where id = p) <> 'waiting_on_client' then raise exception 'unticking changed status'; end if;
  update projects set status = 'underway' where id = p;
  update tasks set done = true where id = t;
  if (select status from projects where id = p) <> 'waiting_on_client' then raise exception 're-tick did not set status'; end if;

  -- Items without a status setting change nothing.
  update projects set status = 'on_hold' where id = p;
  update tasks set done = true where project_id = p and template_id is distinct from tmpl;
  if (select status from projects where id = p) <> 'on_hold' then raise exception 'plain task changed status'; end if;

  -- Auto-advancing into a finished stage still ends Completed, even if the last item sets a status.
  update stages set auto_advance = true where id = launch;
  update tasks set done = false where id = t;
  update tasks set done = true where id = t;
  if (select stage_id from projects where id = p) <> done_stage then raise exception 'did not auto-advance'; end if;
  if (select status from projects where id = p) <> 'completed' then raise exception 'auto-advance into finished stage not completed'; end if;
  update stages set auto_advance = false where id = launch;

  select count(*) into n from activity where project_id = p and message like 'Status changed to %';
  if n < 5 then raise exception 'expected status log rows, got %', n; end if;

  -- Support tasks: done is Completed, reopening is Underway.
  insert into support_tasks (title) values ('Status support') returning id into st;
  if (select status from support_tasks where id = st) <> 'underway' then raise exception 'support default not underway'; end if;
  update support_tasks set status = 'waiting_on_client' where id = st;
  update support_tasks set done = true where id = st;
  if (select status from support_tasks where id = st) <> 'completed' then raise exception 'done support task not completed'; end if;
  update support_tasks set done = false where id = st;
  if (select status from support_tasks where id = st) <> 'underway' then raise exception 'reopened support task not underway'; end if;
end;
$$;
reset role;
select 'ALL PROJECT STATUS TESTS PASSED';
