-- Checks 0008: existing meeting types keep their location as the single
-- ticked option, only known locations are accepted, and bookings store the choice.
do $$
declare
  v_types text[];
  v_details jsonb;
begin
  -- 0001 seeds meeting types; every one should now offer exactly its old location.
  if exists (select 1 from public.event_types where location_types <> array[location_type]) then
    raise exception 'existing meeting types were not backfilled';
  end if;

  insert into public.event_types (slug, name, location_type, location_types, location_details)
  values ('loc-test', 'Location test', 'google_meet', '{google_meet,in_person}', '{"in_person": "12 Smith St"}');
  select location_types, location_details into v_types, v_details from public.event_types where slug = 'loc-test';
  if v_types <> '{google_meet,in_person}' or v_details->>'in_person' <> '12 Smith St' then
    raise exception 'multiple locations not stored';
  end if;

  begin
    update public.event_types set location_types = '{}' where slug = 'loc-test';
    raise exception 'empty location list was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.event_types set location_types = '{zoom}' where slug = 'loc-test';
    raise exception 'unknown location was accepted';
  exception when check_violation then null;
  end;

  insert into public.bookings (event_type_id, name, email, start_at, end_at, location_type, location)
  select id, 'Loc Tester', 'loc@example.com', '2041-03-03 03:17+00', '2041-03-03 03:29+00', 'in_person', 'In person: 12 Smith St'
  from public.event_types where slug = 'loc-test';
  if not exists (select 1 from public.bookings where email = 'loc@example.com' and location_type = 'in_person') then
    raise exception 'booking location not stored';
  end if;

  delete from public.bookings where email = 'loc@example.com';
  delete from public.event_types where slug = 'loc-test';
end;
$$;
select 'ALL MEETING LOCATION TESTS PASSED';
