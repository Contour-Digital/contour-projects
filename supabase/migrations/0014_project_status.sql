-- Project and On-Demand Support task status, like ClickUp's statuses.
--
--   * status is Underway (the default), Waiting on Client, On Hold or Completed.
--   * A project moved into a finished stage (stages.is_closed, e.g. Completed)
--     becomes Completed. Moved back out of one, it goes back to Underway.
--   * A stage checklist item can set the project's status when it's ticked off,
--     e.g. "Send '6-Month Website Performance Review' Email" sets Waiting on
--     Client. The setting lives on the template (sets_status), so changing it
--     in Settings also applies to tasks already on projects.
--   * A support task becomes Completed when it's marked done, and goes back to
--     Underway if it's reopened.
--   * Every project status change is logged in its activity.

alter table public.projects
  add column if not exists status text not null default 'underway'
    check (status in ('underway', 'waiting_on_client', 'on_hold', 'completed'));

alter table public.support_tasks
  add column if not exists status text not null default 'underway'
    check (status in ('underway', 'waiting_on_client', 'on_hold', 'completed'));

alter table public.stage_task_templates
  add column if not exists sets_status text
    check (sets_status in ('underway', 'waiting_on_client', 'on_hold', 'completed'));

create or replace function public.status_label(s text)
returns text
language sql
immutable
set search_path = public
as $$
  select case s
    when 'underway' then 'Underway'
    when 'waiting_on_client' then 'Waiting on Client'
    when 'on_hold' then 'On Hold'
    when 'completed' then 'Completed'
    else s end;
$$;

-- Entering a finished stage completes the project; leaving one reopens it.
create or replace function public.projects_status_on_stage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  now_closed boolean;
  was_closed boolean;
begin
  select is_closed into now_closed from public.stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    if now_closed then new.status = 'completed'; end if;
    return new;
  end if;
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select is_closed into was_closed from public.stages where id = old.stage_id;
  if now_closed then
    new.status = 'completed';
  elsif was_closed and new.status = 'completed' then
    new.status = 'underway';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_status_on_stage on public.projects;
create trigger projects_status_on_stage before insert or update of stage_id on public.projects
  for each row execute function public.projects_status_on_stage();

create or replace function public.projects_log_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.activity (project_id, message)
    values (new.id, 'Status changed to ' || public.status_label(new.status));
  end if;
  return null;
end;
$$;
drop trigger if exists projects_log_status on public.projects;
create trigger projects_log_status after update of status on public.projects
  for each row execute function public.projects_log_status();

-- Ticking a checklist item whose template sets a status sets the project's.
-- Named to run before tasks_auto_advance, so a project that auto-advances into
-- a finished stage still ends up Completed.
create or replace function public.tasks_apply_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if not new.done or old.done or new.template_id is null then
    return null;
  end if;
  select sets_status into next_status from public.stage_task_templates where id = new.template_id;
  if next_status is not null then
    update public.projects set status = next_status
    where id = new.project_id and status is distinct from next_status;
  end if;
  return null;
end;
$$;
drop trigger if exists tasks_apply_status on public.tasks;
create trigger tasks_apply_status after update of done on public.tasks
  for each row execute function public.tasks_apply_status();

-- Support tasks: done means Completed.
create or replace function public.support_tasks_status_on_done()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.done and not old.done then
    new.status = 'completed';
  elsif not new.done and old.done and new.status = 'completed' then
    new.status = 'underway';
  end if;
  return new;
end;
$$;
drop trigger if exists support_tasks_status_on_done on public.support_tasks;
create trigger support_tasks_status_on_done before update of done on public.support_tasks
  for each row execute function public.support_tasks_status_on_done();

revoke execute on function public.projects_status_on_stage() from public, anon, authenticated;
revoke execute on function public.projects_log_status() from public, anon, authenticated;
revoke execute on function public.tasks_apply_status() from public, anon, authenticated;
revoke execute on function public.support_tasks_status_on_done() from public, anon, authenticated;

-- Existing work: finished projects and support tasks start as Completed.
update public.projects p set status = 'completed'
from public.stages s
where s.id = p.stage_id and s.is_closed and p.status <> 'completed';
update public.support_tasks set status = 'completed' where done and status <> 'completed';

-- The 6-Month Performance Review email waits on the client once it's sent.
-- Only fills in an empty setting, so it never overwrites one chosen in Settings.
update public.stage_task_templates set sets_status = 'waiting_on_client'
where title ilike '%6-Month Website Performance Review%' and sets_status is null;
