-- Contour Digital project dashboard: full schema.
--
-- Access model
--   * The dashboard is for the Contour Digital team only. A signed-in user can
--     read or write anything only if their email is in public.team_members
--     (checked by is_team_member(), used by every RLS policy below).
--   * The public booking page never talks to the database as the visitor. Its
--     API routes run on the server with the service role key, so anonymous
--     users get no table access at all.
--   * google_connection holds the Google refresh token. It has RLS on and no
--     policies, so only the service role (server code) can ever read it.
--
-- Automations
--   * Each stage has task templates. When a project is created in a stage, or
--     moved into one, apply_stage_templates() copies that stage's templates
--     onto the project as tasks (once per template, so moving back and forth
--     never duplicates them).
--   * A stage can be set to auto-advance: when every task for that stage on a
--     project is ticked off, the project moves to the next stage by itself.

-- ---------------------------------------------------------------------------
-- Team access
-- ---------------------------------------------------------------------------

create table public.team_members (
  email text primary key check (email = lower(email)),
  name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clients, stages, projects, tasks
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  phone text,
  website text,
  address text,
  abn text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_email_idx on public.clients (lower(email));
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#64748b',
  position integer not null default 0,
  -- Projects in a closed stage (e.g. "Complete") are hidden from "active" counts.
  is_closed boolean not null default false,
  -- When every task for this stage is done, move the project to the next stage.
  auto_advance boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stage_task_templates (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  title text not null,
  description text,
  -- Due date = the day the project enters the stage + this many days. Null = no due date.
  due_offset_days integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index stage_task_templates_stage_idx on public.stage_task_templates (stage_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients (id) on delete set null,
  stage_id uuid not null references public.stages (id) on delete restrict,
  -- Order within the stage column on the board.
  position double precision not null default 0,
  description text,
  value numeric(12, 2),
  start_date date,
  due_date date,
  stage_entered_at timestamptz not null default now(),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_stage_idx on public.projects (stage_id);
create index projects_client_idx on public.projects (client_id);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- The stage this task belongs to (null = general task, not tied to a stage).
  stage_id uuid references public.stages (id) on delete set null,
  template_id uuid references public.stage_task_templates (id) on delete set null,
  title text not null,
  notes text,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  body text not null,
  author_email text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index project_notes_project_idx on public.project_notes (project_id);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index activity_project_idx on public.activity (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Booking (replaces Calendly)
-- ---------------------------------------------------------------------------

create table public.booking_settings (
  id integer primary key default 1 check (id = 1),
  owner_name text not null default 'Contour Digital',
  timezone text not null default 'Australia/Sydney',
  calendar_id text not null default 'primary',
  -- { "1": [{"start":"09:00","end":"17:00"}], ... } keyed by ISO weekday (1 = Monday, 7 = Sunday).
  weekly_hours jsonb not null default '{
    "1": [{"start": "09:00", "end": "17:00"}],
    "2": [{"start": "09:00", "end": "17:00"}],
    "3": [{"start": "09:00", "end": "17:00"}],
    "4": [{"start": "09:00", "end": "17:00"}],
    "5": [{"start": "09:00", "end": "17:00"}],
    "6": [],
    "7": []
  }'::jsonb,
  min_notice_hours integer not null default 12,
  max_days_ahead integer not null default 60,
  buffer_minutes integer not null default 15,
  slot_interval_minutes integer not null default 30,
  updated_at timestamptz not null default now()
);
insert into public.booking_settings (id) values (1);
create trigger booking_settings_updated_at before update on public.booking_settings
  for each row execute function public.set_updated_at();

create table public.google_connection (
  id integer primary key default 1 check (id = 1),
  email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  -- google_meet: a Meet link is added to the event. phone: we call the number they give.
  -- in_person / custom: location_detail is shown to the booker and put on the event.
  location_type text not null default 'google_meet'
    check (location_type in ('google_meet', 'phone', 'in_person', 'custom')),
  location_detail text,
  color text not null default '#0f766e',
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_type_id uuid references public.event_types (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  company text,
  message text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  google_event_id text,
  meet_link text,
  created_at timestamptz not null default now()
);
create index bookings_start_idx on public.bookings (start_at);
-- Two confirmed bookings can never overlap, even if two people click at once.
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (tstzrange(start_at, end_at) with &&) where (status = 'confirmed');

-- Lets the dashboard show whether Google is connected without exposing the token.
create or replace function public.google_connection_status()
returns table (email text, connected_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select g.email, g.connected_at from public.google_connection g
  where public.is_team_member();
$$;

-- ---------------------------------------------------------------------------
-- Automations
-- ---------------------------------------------------------------------------

create or replace function public.local_today()
returns date
language sql
stable
as $$
  select (now() at time zone coalesce(
    (select timezone from public.booking_settings where id = 1), 'Australia/Sydney'))::date;
$$;

-- Keep stage_entered_at accurate whenever a project changes stage.
create or replace function public.projects_before_stage_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_entered_at = now();
  end if;
  return new;
end;
$$;
create trigger projects_stage_entered before insert or update of stage_id on public.projects
  for each row execute function public.projects_before_stage_change();

-- Copy the new stage's task templates onto the project and log the move.
create or replace function public.apply_stage_templates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stage_name text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  insert into public.tasks (project_id, stage_id, template_id, title, notes, due_date, position)
  select new.id, t.stage_id, t.id, t.title, t.description,
         case when t.due_offset_days is null then null
              else public.local_today() + t.due_offset_days end,
         t.position
  from public.stage_task_templates t
  where t.stage_id = new.stage_id
    and not exists (
      select 1 from public.tasks x where x.project_id = new.id and x.template_id = t.id
    );

  select name into stage_name from public.stages where id = new.stage_id;
  insert into public.activity (project_id, message)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'Project created in ' || stage_name
         else 'Moved to ' || stage_name end
  );
  return new;
end;
$$;
create trigger projects_apply_stage_templates after insert or update of stage_id on public.projects
  for each row execute function public.apply_stage_templates();

-- Stamp done_at, and auto-advance the project when its stage's checklist is finished.
create or replace function public.tasks_before_done()
returns trigger
language plpgsql
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at = now();
  elsif not new.done then
    new.done_at = null;
  end if;
  return new;
end;
$$;
create trigger tasks_done_at before insert or update of done on public.tasks
  for each row execute function public.tasks_before_done();

create or replace function public.maybe_auto_advance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.projects;
  s public.stages;
  next_stage_id uuid;
begin
  if not new.done or new.stage_id is null then
    return new;
  end if;

  select * into p from public.projects where id = new.project_id;
  if p.stage_id is distinct from new.stage_id then
    return new;
  end if;

  select * into s from public.stages where id = p.stage_id;
  if not s.auto_advance then
    return new;
  end if;

  if exists (
    select 1 from public.tasks
    where project_id = p.id and stage_id = p.stage_id and not done
  ) then
    return new;
  end if;

  select id into next_stage_id from public.stages
  where position > s.position
  order by position
  limit 1;

  if next_stage_id is not null then
    update public.projects set stage_id = next_stage_id where id = p.id;
  end if;
  return new;
end;
$$;
create trigger tasks_auto_advance after update of done on public.tasks
  for each row execute function public.maybe_auto_advance();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.stages enable row level security;
alter table public.stage_task_templates enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.project_notes enable row level security;
alter table public.activity enable row level security;
alter table public.booking_settings enable row level security;
alter table public.google_connection enable row level security;
alter table public.event_types enable row level security;
alter table public.bookings enable row level security;

create policy team_read on public.team_members for select to authenticated
  using (public.is_team_member());

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'stages', 'stage_task_templates', 'projects', 'tasks',
    'project_notes', 'activity', 'event_types', 'bookings'
  ] loop
    execute format(
      'create policy team_all on public.%I for all to authenticated
         using (public.is_team_member()) with check (public.is_team_member())', t);
  end loop;
end;
$$;

create policy team_read on public.booking_settings for select to authenticated
  using (public.is_team_member());
create policy team_update on public.booking_settings for update to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- google_connection: deliberately no policies (service role only).

-- ---------------------------------------------------------------------------
-- Starter data (edit or delete freely in Settings)
-- ---------------------------------------------------------------------------

do $$
declare
  s_lead uuid; s_proposal uuid; s_onboard uuid; s_design uuid;
  s_build uuid; s_review uuid; s_launch uuid; s_done uuid;
begin
  insert into public.stages (name, color, position) values ('Lead', '#64748b', 0) returning id into s_lead;
  insert into public.stages (name, color, position) values ('Proposal', '#8b5cf6', 1) returning id into s_proposal;
  insert into public.stages (name, color, position, auto_advance) values ('Onboarding', '#0ea5e9', 2, true) returning id into s_onboard;
  insert into public.stages (name, color, position) values ('Design', '#ec4899', 3) returning id into s_design;
  insert into public.stages (name, color, position) values ('Development', '#f59e0b', 4) returning id into s_build;
  insert into public.stages (name, color, position) values ('Client Review', '#14b8a6', 5) returning id into s_review;
  insert into public.stages (name, color, position) values ('Launch', '#22c55e', 6) returning id into s_launch;
  insert into public.stages (name, color, position, is_closed) values ('Complete', '#16a34a', 7, true) returning id into s_done;

  insert into public.stage_task_templates (stage_id, title, due_offset_days, position) values
    (s_lead, 'Discovery call', 3, 0),
    (s_lead, 'Capture requirements and budget', 5, 1),
    (s_proposal, 'Write and send proposal', 3, 0),
    (s_proposal, 'Follow up on proposal', 10, 1),
    (s_onboard, 'Send contract and deposit invoice', 1, 0),
    (s_onboard, 'Deposit received', 7, 1),
    (s_onboard, 'Collect logins, branding and content', 7, 2),
    (s_onboard, 'Kick-off meeting', 7, 3),
    (s_design, 'Sitemap and wireframes', 5, 0),
    (s_design, 'Homepage design', 10, 1),
    (s_design, 'Inner page designs', 14, 2),
    (s_design, 'Client design sign-off', 21, 3),
    (s_build, 'Build site', 14, 0),
    (s_build, 'Load content', 18, 1),
    (s_build, 'Mobile and browser testing', 21, 2),
    (s_build, 'SEO basics (titles, meta, redirects)', 21, 3),
    (s_review, 'Send staging link to client', 1, 0),
    (s_review, 'Make client amendments', 7, 1),
    (s_review, 'Client sign-off', 10, 2),
    (s_launch, 'Send final invoice', 0, 0),
    (s_launch, 'DNS and go live', 2, 1),
    (s_launch, 'Analytics and Search Console', 2, 2),
    (s_launch, 'Handover and training', 5, 3),
    (s_done, 'Request a review', 7, 0);
end;
$$;

insert into public.event_types (slug, name, description, duration_minutes, location_type, position) values
  ('discovery-call', 'Discovery call', 'A quick chat about your project and how we can help.', 30, 'google_meet', 0);
