-- Pre-meeting questions. Each meeting type has its own list, e.g.
--   [{"id": "q1", "label": "What's your budget?", "type": "single_choice",
--     "options": ["Under $5k", "$5k+"], "required": true}]
-- type is short_text, paragraph, checkboxes or single_choice.
alter table public.event_types
  add column questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array');

-- The booker's answers, with each question's wording copied in so editing a
-- question later doesn't change what past bookings show.
--   [{"question": "What's your budget?", "answer": "$5k+"}]
alter table public.bookings
  add column answers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(answers) = 'array');

-- Put the answers in the confirmation email, just under {{details}}. Blank
-- lines are tidied away when there are no answers.
update public.booking_settings
set confirmation_body = replace(confirmation_body, '{{details}}', E'{{details}}\n\n{{answers}}')
where confirmation_body like '%{{details}}%' and confirmation_body not like '%{{answers}}%';

alter table public.booking_settings
  alter column confirmation_body set default
'Hi {{first_name}},

Thanks for booking a {{meeting_type}} with {{owner_name}}. Here are the details:

When: {{date}} at {{time}} ({{timezone}})
Length: {{duration}}
Where: {{location}}

{{details}}

{{answers}}

If you need to change the time, just reply to this email.

Kind regards,
{{owner_name}}';
