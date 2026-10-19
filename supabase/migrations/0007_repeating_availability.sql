-- Booking availability can follow either the weekly hours or a repeating
-- schedule: one or more start dates, each with its own hours, repeating every
-- N days (e.g. from 19 Oct 2026, 9-5, every 8 days).
-- repeating_hours: [{ "start_date": "2026-10-19", "every_days": 8, "hours": [{"start":"09:00","end":"17:00"}] }, ...]
alter table public.booking_settings
  add column availability_mode text not null default 'weekly'
    check (availability_mode in ('weekly', 'repeating')),
  add column repeating_hours jsonb not null default '[]'::jsonb
    check (jsonb_typeof(repeating_hours) = 'array');
