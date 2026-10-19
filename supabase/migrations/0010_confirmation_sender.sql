-- Confirmation emails can be sent from an alias of the connected Gmail
-- account (one set up under Gmail Settings, Accounts, "Send mail as").
-- Null means the connected address. Gmail itself only honours verified
-- aliases; any other From address is replaced with the account's own.

alter table public.booking_settings
  add column confirmation_from_email text
    check (confirmation_from_email is null or confirmation_from_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  add column confirmation_from_name text;
