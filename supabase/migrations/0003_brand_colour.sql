-- Contour Digital logo blue as the default meeting type colour, replacing the original teal.
alter table public.event_types alter column color set default '#0098ff';
update public.event_types set color = '#0098ff' where color = '#0f766e';
