export type Client = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  abn: string | null;
  notes: string | null;
  hosting_subscription: HostingSubscription | null;
  maintenance_subscription: boolean;
  google_drive_url: string | null;
  lead_source: LeadSource | null;
  client_since: string | null;
  preferred_contact: ContactMethod | null;
  domain_location: DomainLocation | null;
  domain_registrar: string | null;
  domain_login_updated_at: string | null;
  offboarded_at: string | null;
  offboarding_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type HostingSubscription = "standard" | "ecommerce" | "non_profit";
export type LeadSource = "website" | "social_media" | "referral" | "outreach" | "existing_client" | "networking";
export type ContactMethod = "email" | "phone" | "text";
export type DomainLocation = "internal" | "external";

export type Stage = {
  id: string;
  name: string;
  color: string;
  position: number;
  is_closed: boolean;
  auto_advance: boolean;
};

export type StageTaskTemplate = {
  id: string;
  stage_id: string;
  title: string;
  description: string | null;
  due_offset_days: number | null;
  position: number;
};

export type Project = {
  id: string;
  name: string;
  client_id: string | null;
  stage_id: string;
  position: number;
  description: string | null;
  value: number | null;
  start_date: string | null;
  due_date: string | null;
  stage_entered_at: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  stage_id: string | null;
  template_id: string | null;
  title: string;
  notes: string | null;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  position: number;
  created_at: string;
};

export type ProjectNote = {
  id: string;
  project_id: string;
  body: string;
  author_email: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  project_id: string | null;
  message: string;
  created_at: string;
};

export type TimeRange = { start: string; end: string }; // "HH:mm"
export type WeeklyHours = Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", TimeRange[]>;

export type BookingSettings = {
  id: 1;
  owner_name: string;
  timezone: string;
  calendar_id: string;
  weekly_hours: WeeklyHours;
  min_notice_hours: number;
  max_days_ahead: number;
  buffer_minutes: number;
  slot_interval_minutes: number;
  confirmation_enabled: boolean;
  confirmation_subject: string;
  confirmation_body: string;
};

export type LocationType = "google_meet" | "phone" | "in_person" | "custom";

export type EventType = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  location_type: LocationType;
  location_detail: string | null;
  color: string;
  active: boolean;
  position: number;
};

export type Booking = {
  id: string;
  event_type_id: string | null;
  client_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  /** Details from the booker, or the agenda for an ad hoc meeting. */
  message: string | null;
  start_at: string;
  end_at: string;
  timezone: string | null;
  status: "confirmed" | "cancelled";
  google_event_id: string | null;
  meet_link: string | null;
  /** "public": booked on the booking page. "ad_hoc": added in Meetings, any time. */
  source: "public" | "ad_hoc";
  /** One-off title when an ad hoc meeting isn't one of the meeting types. */
  title: string | null;
  location: string | null;
  invite_sent: boolean;
  confirmation_sent_at: string | null;
  ical_uid: string | null;
  calendar_token: string;
  created_at: string;
};

export type AdminArea = "admin" | "business" | "outreach";
export type Recurrence = "none" | "daily" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export type AdminTask = {
  id: string;
  parent_id: string | null;
  area: AdminArea;
  title: string;
  notes: string | null;
  due_date: string | null;
  recurrence: Recurrence;
  done: boolean;
  done_at: string | null;
  next_created: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type AdminTaskClient = {
  task_id: string;
  client_id: string;
  emailed: boolean;
  emailed_at: string | null;
  note: string | null;
  created_at: string;
};
