-- Checks 0009: questions and answers are stored as lists, and the default
-- confirmation email gains {{answers}}.
do $$
begin
  insert into public.event_types (slug, name, questions)
  values ('q-test', 'Question test', '[{"id": "a", "label": "Budget?", "type": "single_choice", "options": ["Low", "High"], "required": true}]');
  if (select questions->0->>'label' from public.event_types where slug = 'q-test') <> 'Budget?' then
    raise exception 'questions not stored';
  end if;

  begin
    update public.event_types set questions = '{"a": 1}' where slug = 'q-test';
    raise exception 'non-list questions were accepted';
  exception when check_violation then null;
  end;

  if exists (select 1 from public.event_types where questions <> '[]'::jsonb and slug <> 'q-test') then
    raise exception 'existing meeting types should start with no questions';
  end if;

  insert into public.bookings (event_type_id, name, email, start_at, end_at, answers)
  select id, 'Q Tester', 'q@example.com', '2042-04-04 04:13+00', '2042-04-04 04:27+00', '[{"question": "Budget?", "answer": "High"}]'
  from public.event_types where slug = 'q-test';
  if (select answers->0->>'answer' from public.bookings where email = 'q@example.com') <> 'High' then
    raise exception 'answers not stored';
  end if;

  if (select confirmation_body from public.booking_settings where id = 1) not like '%{{details}}' || E'\n\n' || '{{answers}}%' then
    raise exception 'confirmation email was not given {{answers}}';
  end if;

  delete from public.bookings where email = 'q@example.com';
  delete from public.event_types where slug = 'q-test';
end;
$$;
select 'ALL MEETING QUESTION TESTS PASSED';
