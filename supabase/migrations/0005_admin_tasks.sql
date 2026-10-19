-- Admin, business and client outreach tasks (not tied to a project).
--
--   * admin_tasks holds them all. "area" sorts them into Admin, Business
--     management or Client outreach. They show in My tasks with project tasks,
--     and in full (subtasks, notes, clients to email) on Business & Outreach.
--   * A subtask is an admin_tasks row with parent_id set.
--   * A task can repeat. When a repeating task is ticked off, the next one is
--     created with the next due date (after today), with its subtasks reset and
--     the same clients to email, not yet emailed.
--   * admin_task_clients is the list of clients to email about a task. The app
--     only tracks who has been emailed; it doesn't send anything.

create table public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.admin_tasks (id) on delete cascade,
  area text not null default 'admin' check (area in ('admin', 'business', 'outreach')),
  title text not null,
  notes text,
  due_date date,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  done boolean not null default false,
  done_at timestamptz,
  -- Set once the next repeat has been created, so unticking and re-ticking never makes two.
  next_created boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only top-level tasks repeat; subtasks follow their parent.
  check (parent_id is null or recurrence = 'none')
);
create index admin_tasks_parent_idx on public.admin_tasks (parent_id);
create index admin_tasks_open_idx on public.admin_tasks (done, due_date) where parent_id is null;
create trigger admin_tasks_updated_at before update on public.admin_tasks
  for each row execute function public.set_updated_at();

create table public.admin_task_clients (
  task_id uuid not null references public.admin_tasks (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  emailed boolean not null default false,
  emailed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  primary key (task_id, client_id)
);
create index admin_task_clients_client_idx on public.admin_task_clients (client_id);

-- The next due date for a repeat: steps on from the current due date (or today
-- if there isn't one) until it lands after today. Steps are counted from the
-- original date so monthly tasks on the 31st don't drift to the 28th.
create or replace function public.next_due_date(base date, recurrence text)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  step interval;
  today date := public.local_today();
  start date := coalesce(base, today);
  n integer := 1;
  candidate date;
begin
  step := case recurrence
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'fortnightly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'yearly' then interval '1 year'
  end;
  if step is null then
    return null;
  end if;
  loop
    candidate := (start + step * n)::date;
    exit when candidate > today;
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

create or replace function public.admin_tasks_before_done()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_id uuid;
  next_due date;
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at = now();
  elsif not new.done then
    new.done_at = null;
  end if;

  if tg_op = 'UPDATE' and new.done and not old.done
     and new.parent_id is null and new.recurrence <> 'none' and not new.next_created then
    next_due := public.next_due_date(new.due_date, new.recurrence);
    insert into public.admin_tasks (area, title, notes, due_date, recurrence, position)
    values (new.area, new.title, new.notes, next_due, new.recurrence, new.position)
    returning id into next_id;

    -- Subtasks keep the same gap to the parent's due date.
    insert into public.admin_tasks (parent_id, area, title, notes, due_date, position)
    select next_id, s.area, s.title, s.notes,
           case when s.due_date is null then null
                when new.due_date is null then next_due
                else s.due_date + (next_due - new.due_date) end,
           s.position
    from public.admin_tasks s
    where s.parent_id = new.id;

    insert into public.admin_task_clients (task_id, client_id, note)
    select next_id, c.client_id, c.note
    from public.admin_task_clients c
    where c.task_id = new.id;

    new.next_created = true;
  end if;
  return new;
end;
$$;
create trigger admin_tasks_done before update of done on public.admin_tasks
  for each row execute function public.admin_tasks_before_done();

create or replace function public.admin_task_clients_before_emailed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.emailed and (tg_op = 'INSERT' or not old.emailed) then
    new.emailed_at = now();
  elsif not new.emailed then
    new.emailed_at = null;
  end if;
  return new;
end;
$$;
create trigger admin_task_clients_emailed before insert or update of emailed on public.admin_task_clients
  for each row execute function public.admin_task_clients_before_emailed();

revoke execute on function public.admin_tasks_before_done() from public, anon, authenticated;
revoke execute on function public.admin_task_clients_before_emailed() from public, anon, authenticated;
revoke execute on function public.next_due_date(date, text) from public, anon;
grant execute on function public.next_due_date(date, text) to authenticated;

alter table public.admin_tasks enable row level security;
alter table public.admin_task_clients enable row level security;

create policy team_all on public.admin_tasks for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
create policy team_all on public.admin_task_clients for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
