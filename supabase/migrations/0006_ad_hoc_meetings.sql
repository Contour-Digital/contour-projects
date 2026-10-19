-- Ad hoc meetings and confirmation emails.
--
--   * bookings.source says where a meeting came from: 'public' (the booking
--     page) or 'ad_hoc' (added by the team in Meetings, any time, ignoring the
--     booking page hours). Only public bookings are stopped from overlapping,
--     so the team can deliberately double-book; the booking page still treats
--     ad hoc meetings as busy.
--   * An ad hoc meeting can use a meeting type or a one-off title, and the
--     client may have no email, so email is now optional.
--   * Confirmation emails are sent from the connected Google account (Gmail),
--     using the editable template in booking_settings. calendar_token is the
--     unguessable key in the email's "Add to calendar" (.ics) link.
--   * google_connection.scopes records what Google allowed, so the app knows
--     whether it may send email or needs reconnecting.

alter table public.bookings
  add column source text not null default 'public' check (source in ('public', 'ad_hoc')),
  add column title text,
  add column location text,
  add column invite_sent boolean not null default false,
  add column confirmation_sent_at timestamptz,
  add column ical_uid text,
  add column calendar_token uuid not null default gen_random_uuid() unique;

alter table public.bookings alter column email drop not null;

alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (tstzrange(start_at, end_at) with &&) where (status = 'confirmed' and source = 'public');

alter table public.booking_settings
  add column confirmation_enabled boolean not null default true,
  add column confirmation_subject text not null default 'Confirmed: {{meeting_type}} on {{date}}',
  add column confirmation_body text not null default
'Hi {{first_name}},

Thanks for booking a {{meeting_type}} with {{owner_name}}. Here are the details:

When: {{date}} at {{time}} ({{timezone}})
Length: {{duration}}
Where: {{location}}

{{details}}

If you need to change the time, just reply to this email.

Kind regards,
{{owner_name}}';

alter table public.google_connection add column scopes text;

-- Return type changes, so drop and recreate (with the same grants as 0002).
drop function public.google_connection_status();
create function public.google_connection_status()
returns table (email text, connected_at timestamptz, can_send_email boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.email, g.connected_at,
         coalesce(g.scopes like '%auth/gmail.send%', false)
  from public.google_connection g
  where public.is_team_member();
$$;
revoke execute on function public.google_connection_status() from public, anon;
grant execute on function public.google_connection_status() to authenticated;
