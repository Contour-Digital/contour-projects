-- On-Demand Support: one-off and regular site work for clients, billed per task.
--
--   * support_tasks holds each piece of work: a name, the client, the day it's
--     scheduled for, and the On-Demand Support tag it's billed under.
--   * tag is one of the four billing tags (prices live in the app). price is
--     what this task will be billed at: it starts at the tag's price and can
--     be changed, e.g. for Advanced Customization, which is quoted on scope.
--   * invoiced is ticked once the task has been billed.
--   * support_subtasks is the checklist for a task.

create table public.support_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  tag text not null default 'content_updates'
    check (tag in ('content_updates', 'site_enhancements', 'advanced_customization', 'notification_banner')),
  price numeric(10, 2) check (price is null or price >= 0),
  scheduled_date date,
  notes text,
  done boolean not null default false,
  done_at timestamptz,
  invoiced boolean not null default false,
  invoiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tasks_open_idx on public.support_tasks (done, scheduled_date);
create index support_tasks_client_idx on public.support_tasks (client_id);
create trigger support_tasks_updated_at before update on public.support_tasks
  for each row execute function public.set_updated_at();

create table public.support_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.support_tasks (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index support_subtasks_task_idx on public.support_subtasks (task_id);

create or replace function public.support_tasks_before_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at = now();
  elsif not new.done then
    new.done_at = null;
  end if;
  if new.invoiced and (tg_op = 'INSERT' or not old.invoiced) then
    new.invoiced_at = now();
  elsif not new.invoiced then
    new.invoiced_at = null;
  end if;
  return new;
end;
$$;
create trigger support_tasks_stamps before insert or update of done, invoiced on public.support_tasks
  for each row execute function public.support_tasks_before_change();

revoke execute on function public.support_tasks_before_change() from public, anon, authenticated;

alter table public.support_tasks enable row level security;
alter table public.support_subtasks enable row level security;

create policy team_all on public.support_tasks for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
create policy team_all on public.support_subtasks for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
