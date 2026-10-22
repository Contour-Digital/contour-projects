-- Repeating On-Demand Support tasks, e.g. a client's monthly site maintenance.
--
--   * recurrence uses the same options as admin tasks (0005_admin_tasks.sql).
--   * When a repeating task is ticked done, the next one is created with the
--     next scheduled date after today (next_due_date), the same client, tag,
--     price, notes and subtasks, with the subtasks not done and not invoiced.
--   * next_created stops unticking and re-ticking from making two.

alter table public.support_tasks
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  add column if not exists next_created boolean not null default false;

create or replace function public.support_tasks_after_done()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_id uuid;
begin
  if new.done and not old.done and new.recurrence <> 'none' and not new.next_created then
    insert into public.support_tasks (client_id, title, tag, price, scheduled_date, notes, recurrence)
    values (new.client_id, new.title, new.tag, new.price,
            public.next_due_date(new.scheduled_date, new.recurrence), new.notes, new.recurrence)
    returning id into next_id;

    insert into public.support_subtasks (task_id, title, position)
    select next_id, s.title, s.position
    from public.support_subtasks s
    where s.task_id = new.id;

    update public.support_tasks set next_created = true where id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists support_tasks_repeat on public.support_tasks;
create trigger support_tasks_repeat after update of done on public.support_tasks
  for each row execute function public.support_tasks_after_done();

revoke execute on function public.support_tasks_after_done() from public, anon, authenticated;
