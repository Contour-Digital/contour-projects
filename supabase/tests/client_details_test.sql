-- Run after automations_test.sql. Checks domain logins and offboarding.
\set ON_ERROR_STOP 1
reset role;
insert into public.team_members (email) values ('team@example.com') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal2"}', false);

do $$
declare
  c uuid; p uuid; lead uuid; u text; pw text; n int;
begin
  select id into lead from stages where name = 'Lead';
  insert into clients (name, hosting_subscription, maintenance_subscription, lead_source, preferred_contact, domain_location)
    values ('Domain Co', 'ecommerce', true, 'referral', 'email', 'external') returning id into c;
  insert into projects (name, stage_id, client_id) values ('Domain Co site', lead, c) returning id into p;

  begin
    update clients set hosting_subscription = 'gold' where id = c;
    raise exception 'bad hosting value allowed';
  exception when check_violation then null;
  end;

  perform save_domain_login(c, 'owner@domain.test', 'hunter2');
  select r.username, r.password into u, pw from reveal_domain_login(c) r;
  if u <> 'owner@domain.test' or pw <> 'hunter2' then raise exception 'login round trip failed'; end if;
  if (select domain_login_updated_at from clients where id = c) is null then raise exception 'login flag not set'; end if;

  -- Saving again updates the same secret.
  perform save_domain_login(c, 'owner@domain.test', 'new-pass');
  select r.password into pw from reveal_domain_login(c) r;
  if pw <> 'new-pass' then raise exception 'login update failed'; end if;

  select count(*) into n from domain_login_log where client_id = c and action = 'viewed';
  if n <> 2 then raise exception 'expected 2 view log rows, got %', n; end if;

  -- Signed-in users can't read the mapping or Vault directly.
  begin
    perform 1 from client_domain_logins;
    raise exception 'mapping readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from vault.decrypted_secrets;
    raise exception 'vault readable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into domain_login_log (client_id, action) values (c, 'viewed');
    raise exception 'log writable';
  exception when insufficient_privilege then null;
  end;

  -- Offboarding archives projects and removes the login, keeping the record.
  perform offboard_client(c, '2030-06-30', 'Moved to another agency', true, true);
  if (select offboarded_at from clients where id = c) <> '2030-06-30' then raise exception 'not offboarded'; end if;
  if not (select archived from projects where id = p) then raise exception 'project not archived'; end if;
  if (select domain_login_updated_at from clients where id = c) is not null then raise exception 'login flag not cleared'; end if;
  if exists (select 1 from reveal_domain_login(c)) then raise exception 'login survived offboarding'; end if;

  perform restore_client(c);
  if (select offboarded_at from clients where id = c) is not null then raise exception 'not restored'; end if;
end;
$$;

-- Removing a login (or the client) deletes the Vault secret too.
reset role;
do $$
declare c uuid; n int;
begin
  select id into c from clients where name = 'Domain Co';
  perform set_config('request.jwt.claims', '{"email":"team@example.com","aal":"aal2"}', true);
  perform save_domain_login(c, 'x', 'y');
  select count(*) into n from vault.secrets;
  if n <> 1 then raise exception 'expected 1 secret, got %', n; end if;
  delete from clients where id = c;
  select count(*) into n from vault.secrets;
  if n <> 0 then raise exception 'secret left behind after client delete'; end if;
end;
$$;

-- Off the team: can't save or reveal.
set role authenticated;
select set_config('request.jwt.claims', '{"email":"stranger@example.com","aal":"aal2"}', false);
do $$
begin
  begin
    perform reveal_domain_login(gen_random_uuid());
    raise exception 'stranger could reveal';
  exception when insufficient_privilege then null;
  end;
  begin
    perform save_domain_login(gen_random_uuid(), 'a', 'b');
    raise exception 'stranger could save';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set role anon;
do $$
begin
  perform reveal_domain_login(gen_random_uuid());
  raise exception 'anon could call reveal';
exception when insufficient_privilege then null;
end;
$$;
reset role;
select 'ALL CLIENT DETAILS TESTS PASSED';
