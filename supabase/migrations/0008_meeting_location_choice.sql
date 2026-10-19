-- Meeting types can offer several locations (Google Meet, phone, in person,
-- other) and the booker picks one. location_type / location_detail stay as the
-- first offered option so older code that reads them keeps working.

alter table public.event_types
  add column location_types text[] not null default '{google_meet}',
  -- Address or details per location, e.g. {"in_person": "12 Smith St"}.
  add column location_details jsonb not null default '{}'::jsonb;

update public.event_types
set location_types = array[location_type],
    location_details = case
      when location_detail is not null and location_type in ('in_person', 'custom')
        then jsonb_build_object(location_type, location_detail)
      else '{}'::jsonb
    end;

alter table public.event_types
  add constraint event_types_location_types_valid
  check (
    cardinality(location_types) >= 1
    and location_types <@ array['google_meet', 'phone', 'in_person', 'custom']
  );

-- What the booker chose, and the text shown for it (address, phone details).
-- bookings.location may already exist from the ad hoc meetings migration; share it.
alter table public.bookings
  add column location_type text
    check (location_type in ('google_meet', 'phone', 'in_person', 'custom')),
  add column if not exists location text;

update public.bookings b
set location_type = t.location_type,
    location = coalesce(b.location, case when t.location_type in ('in_person', 'custom') then t.location_detail end)
from public.event_types t
where b.event_type_id = t.id;
