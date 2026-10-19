# Contour Digital Projects

Contour Digital's own project dashboard and booking page, replacing ClickUp and Calendly.

- **Current Projects**: every client project in one list with its stage (Lead → Proposal → Onboarding → Design → Development → Client Review → Launch → Complete). Change a project's stage from its row.
- **Stage automations**: each stage has a task checklist. When a project enters a stage, that checklist is added to the project with due dates. A stage can also move projects on to the next stage by itself once its checklist is done.
- **Clients**: contact details, ABN, address and notes, linked to their projects and bookings.
- **My tasks**: every open task across active projects, plus your own admin tasks, grouped by overdue / today / this week. Add admin tasks here and set them to repeat.
- **Business & Outreach**: admin, business management and client outreach tasks (e.g. remind clients to put up a public holiday notice). Each has subtasks, a due date, an optional repeat, notes, and a list of clients to email with an *emailed* tick for each. Ticking off a repeating task creates the next one.
- **Clients**: contact details, ABN, address, hosting and maintenance subscriptions, lead source, Google Drive link and notes, linked to their projects and bookings. The Clients tab lists them by hosting subscription. Offboarding moves a client to Former clients without deleting anything.
- **Domain logins**: for a domain managed externally, the registrar username and password are encrypted with Supabase Vault in the Sydney database. They only show when revealed on the client page, and every reveal is logged in `domain_login_log`.
- **My tasks**: every open task across active projects, grouped by overdue / today / this week.
- **Meetings**: everything booked through the booking page, upcoming and past. Add an **ad hoc meeting** at any time, outside your booking hours, with a client (or someone new), a meeting type or a one-off name, and details. Optionally send them a Google Calendar invite and a confirmation email.
- **Confirmation emails**: an editable template (Settings → Booking page) with placeholders like `{{first_name}}`, `{{date}}`, `{{time}}` and `{{location}}`. Sent from your connected Google account after every public booking (if switched on) and for ad hoc meetings, with Google, Outlook and Apple "Add to calendar" buttons and an `.ics` attachment.
- **Settings**: stages and their automations, and the booking page.
- **Booking page**: a Calendly-style page that reads your Google Calendar for busy times, adds each booking to it (with a Google Meet link) and emails the invite. Embed it on any website with two lines of HTML.

Next.js (App Router) + TypeScript + Tailwind on the front end, Supabase (Postgres + Auth) behind it, hosted on Vercel. Same stack as the Wedding Planner app.

## Setup

### 1. Supabase

Create the project in the **Sydney (ap-southeast-2)** region so client data stays in Australia. A Supabase project's region can't be changed later.

1. Create a project at [supabase.com](https://supabase.com) (Sydney region is closest).
2. **SQL Editor** → paste and run each file in [`supabase/migrations`](supabase/migrations) in order, starting with `0001_init.sql`. It creates every table, the security rules, the automations and starter stages/checklists you can edit later.
3. Add yourself to the team (only listed emails can see any data):
   ```sql
   insert into team_members (email) values ('you@contourdigital.com.au');
   ```
4. **Authentication → Users → Add user**: same email, a password, tick *Auto confirm*.
5. **Authentication → Sign In / Providers**: turn off *Allow new users to sign up*. Only users you add can sign in.
6. Note the **Project URL**, **anon key** and **service_role key** (Project Settings → API).

### 2. Google Calendar

1. [Google Cloud Console](https://console.cloud.google.com) → create a project (e.g. "Contour Booking").
2. **APIs & Services → Library** → enable **Google Calendar API** and **Gmail API** (Gmail sends the confirmation emails from your address).
3. **OAuth consent screen** → External → fill in the app name and your email. Add the scopes `.../auth/calendar.events`, `.../auth/calendar.freebusy` and `.../auth/gmail.send`. Then **Publish app** (set it to *In production*). In *Testing* mode Google expires the connection every 7 days. Google will show an "unverified app" warning when you connect; that's expected for a private app only you sign in to.
4. **Credentials → Create credentials → OAuth client ID** → *Web application*. Authorised redirect URI: `https://YOUR-APP-DOMAIN/api/google/callback` (and `http://localhost:3000/api/google/callback` for local dev).
5. Note the **Client ID** and **Client secret**.

### 3. Vercel

1. Import this repository in Vercel.
2. Add the environment variables from [`.env.example`](.env.example):
   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server only) |
   | `NEXT_PUBLIC_SITE_URL` | e.g. `https://projects.contourdigital.com.au` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 2 |
3. Server code runs in Vercel's Sydney region (`syd1`), set in [`vercel.json`](vercel.json).
4. Deploy, and optionally add a custom domain (update `NEXT_PUBLIC_SITE_URL` and the Google redirect URI to match).

### 4. Connect and embed

1. Sign in → **Booking page** → **Connect Google Calendar**.
2. Set your hours, timezone, buffers and meeting types.
3. Copy the embed code into your website (in Duda: an HTML/embed widget):
   ```html
   <div data-contour-booking="discovery-call"></div>
   <script src="https://YOUR-APP-DOMAIN/embed.js" async></script>
   ```
   Or link straight to `https://YOUR-APP-DOMAIN/book/discovery-call`.

## How it works

- **Security**: every table has row-level security. Only signed-in users whose email is in `team_members` can read or write. The public booking page never queries the database as the visitor: its API routes (`/api/availability`, `/api/book`) run on the server with the service role key and only expose open time slots. The Google refresh token lives in `google_connection`, which no signed-in user can read.
- **Automations** are Postgres triggers (see the top of the migration), so they run the same way however a project is moved.
- **Double bookings** are impossible: an exclusion constraint stops two confirmed booking-page bookings overlapping, and the slot is re-checked against Google right before booking.
- **Ad hoc meetings** skip the booking page rules (hours, notice, buffers). If one clashes with your calendar you're asked before it's booked. The booking page treats them as busy.
- **Email stays with Google**: confirmation emails go through your own Gmail account, like the calendar invites, so no other email service sees client details. The `.ics` link in the email (`/api/calendar/<token>.ics`) uses a random per-meeting token.
- **New bookers become clients**: a booking from an unknown email creates a client record; a known email is linked to the existing client.

## Development

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev
```

Checks (also run in CI): `npm run typecheck`, `npm run lint`, `npm test` (booking slot maths), `npm run build`.
Database tests: see [`supabase/tests/README.md`](supabase/tests/README.md).
