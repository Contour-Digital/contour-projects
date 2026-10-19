# Database tests

`automations_test.sql` checks the stage automations, auto-advance, the double-booking guard and the access rules. It runs against plain Postgres 15+ with `supabase_stub.sql` standing in for the bits Supabase provides:

```bash
createdb contour_test
psql -d contour_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/supabase_stub.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/migrations/0002_harden_functions.sql \
  -f supabase/migrations/0003_brand_colour.sql \
  -f supabase/migrations/0004_client_details.sql \
  -f supabase/migrations/0006_ad_hoc_meetings.sql \
  -f supabase/migrations/0008_meeting_location_choice.sql \
  -f supabase/migrations/0009_meeting_questions.sql \
  -f supabase/tests/automations_test.sql \
  -f supabase/tests/client_details_test.sql \
  -f supabase/tests/ad_hoc_meetings_test.sql \
  -f supabase/tests/meeting_locations_test.sql \
  -f supabase/tests/meeting_questions_test.sql
```

It prints `ALL AUTOMATION/RLS TESTS PASSED` or stops at the first failure. CI runs it on every push.
