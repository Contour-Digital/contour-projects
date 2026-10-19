-- Client details, domain logins and offboarding.
--
-- Domain logins
--   * When a client's domain is managed externally we can keep their registrar
--     login. The username and password are encrypted with Supabase Vault and
--     stay in this (Sydney) database; nothing goes to an outside service.
--   * client_domain_logins only maps a client to its Vault secret. It has RLS
--     on and no policies, and Vault itself is closed to signed-in users, so the
--     only way to read a login is reveal_domain_login(), which checks the
--     caller is on the team and writes who viewed it to domain_login_log.
--
-- Offboarding
--   * offboard_client() marks a client as a former client. Nothing is deleted:
--     their record, projects and bookings stay, and restore_client() undoes it.

-- ---------------------------------------------------------------------------
-- New client fields
-- ---------------------------------------------------------------------------

alter table public.clients
  add column hosting_subscription text
    check (hosting_subscription in ('standard', 'ecommerce', 'non_profit')),
  add column maintenance_subscription boolean not null default false,
  add column google_drive_url text,
  add column lead_source text
    check (lead_source in ('website', 'social_media', 'referral', 'outreach', 'existing_client', 'networking')),
  add column client_since date,
  add column preferred_contact text
    check (preferred_contact in ('email', 'phone', 'text')),
  -- internal: we manage the domain. external: the client (or someone else) does.
  add column domain_location text
    check (domain_location in ('internal', 'external')),
  -- Where the external domain is managed, e.g. "GoDaddy" or the login page URL.
  add column domain_registrar text,
  -- Set when a domain login is saved; null when there is none. Lets the
  -- dashboard show that a login exists without reading it.
  add column domain_login_updated_at timestamptz,
  add column offboarded_at date,
  add column offboarding_reason text;

-- ---------------------------------------------------------------------------
-- Domain logins (encrypted with Vault)
-- ---------------------------------------------------------------------------

create table public.client_domain_logins (
  client_id uuid primary key references public.clients (id) on delete cascade,
  secret_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.client_domain_logins enable row level security;
-- Deliberately no policies (functions below only).
revoke all on public.client_domain_logins from public, anon, authenticated;

create table public.domain_login_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  action text not null check (action in ('saved', 'viewed', 'removed')),
  actor_email text,
  created_at timestamptz not null default now()
);
create index domain_login_log_client_idx on public.domain_login_log (client_id, created_at desc);
alter table public.domain_login_log enable row level security;
-- The team can read the log; only the functions below write to it.
create policy team_read on public.domain_login_log for select to authenticated
  using (public.is_team_member());
revoke insert, update, delete on public.domain_login_log from public, anon, authenticated;

-- Removing a mapping (client deleted, login removed) also deletes the secret.
create or replace function public.client_domain_logins_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
create trigger client_domain_logins_delete_secret after delete on public.client_domain_logins
  for each row execute function public.client_domain_logins_after_delete();

create or replace function public.save_domain_login(p_client_id uuid, p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text := json_build_object('username', coalesce(p_username, ''), 'password', coalesce(p_password, ''))::text;
  v_secret_id uuid;
begin
  if not public.is_team_member() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'client not found';
  end if;

  select secret_id into v_secret_id from public.client_domain_logins where client_id = p_client_id;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_secret, 'domain_login_' || p_client_id::text, 'Domain registrar login for a client');
    insert into public.client_domain_logins (client_id, secret_id) values (p_client_id, v_secret_id);
  else
    perform vault.update_secret(v_secret_id, v_secret);
    update public.client_domain_logins set updated_at = now() where client_id = p_client_id;
  end if;

  update public.clients set domain_login_updated_at = now() where id = p_client_id;
  insert into public.domain_login_log (client_id, action, actor_email)
    values (p_client_id, 'saved', lower(auth.jwt() ->> 'email'));
end;
$$;

create or replace function public.reveal_domain_login(p_client_id uuid)
returns table (username text, password text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if not public.is_team_member() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  select d.decrypted_secret into v_secret
  from public.client_domain_logins l
  join vault.decrypted_secrets d on d.id = l.secret_id
  where l.client_id = p_client_id;
  if v_secret is null then
    return;
  end if;

  insert into public.domain_login_log (client_id, action, actor_email)
    values (p_client_id, 'viewed', lower(auth.jwt() ->> 'email'));
  return query select v_secret::jsonb ->> 'username', v_secret::jsonb ->> 'password';
end;
$$;

create or replace function public.remove_domain_login(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_member() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  delete from public.client_domain_logins where client_id = p_client_id;
  if found then
    insert into public.domain_login_log (client_id, action, actor_email)
      values (p_client_id, 'removed', lower(auth.jwt() ->> 'email'));
  end if;
  update public.clients set domain_login_updated_at = null where id = p_client_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Offboarding
-- ---------------------------------------------------------------------------

create or replace function public.offboard_client(
  p_client_id uuid,
  p_date date,
  p_reason text,
  p_archive_projects boolean,
  p_remove_domain_login boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_member() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  update public.clients
  set offboarded_at = coalesce(p_date, public.local_today()),
      offboarding_reason = nullif(trim(p_reason), '')
  where id = p_client_id;
  if not found then
    raise exception 'client not found';
  end if;

  if p_archive_projects then
    update public.projects set archived = true where client_id = p_client_id and not archived;
  end if;
  if p_remove_domain_login then
    perform public.remove_domain_login(p_client_id);
  end if;
end;
$$;

create or replace function public.restore_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_member() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.clients set offboarded_at = null, offboarding_reason = null where id = p_client_id;
end;
$$;

revoke execute on function public.client_domain_logins_after_delete() from public, anon, authenticated;
revoke execute on function public.save_domain_login(uuid, text, text) from public, anon;
revoke execute on function public.reveal_domain_login(uuid) from public, anon;
revoke execute on function public.remove_domain_login(uuid) from public, anon;
revoke execute on function public.offboard_client(uuid, date, text, boolean, boolean) from public, anon;
revoke execute on function public.restore_client(uuid) from public, anon;
grant execute on function public.save_domain_login(uuid, text, text) to authenticated;
grant execute on function public.reveal_domain_login(uuid) to authenticated;
grant execute on function public.remove_domain_login(uuid) to authenticated;
grant execute on function public.offboard_client(uuid, date, text, boolean, boolean) to authenticated;
grant execute on function public.restore_client(uuid) to authenticated;
