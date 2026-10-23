import type { Answer, Question } from "@/lib/booking/questions";

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

/** Project and support task status (see src/lib/status.ts). */
export type WorkStatus = "underway" | "waiting_on_client" | "on_hold" | "completed";

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
  /** Ticking this item off sets the project's status to this. */
  sets_status: WorkStatus | null;
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
  status: WorkStatus;
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
/** Hours that apply on start_date and every `every_days` days after it. */
export type RepeatingRule = { start_date: string; every_days: number; hours: TimeRange[] }; // start_date "yyyy-MM-dd"
export type AvailabilityMode = "weekly" | "repeating";

export type BookingSettings = {
  id: 1;
  owner_name: string;
  timezone: string;
  calendar_id: string;
  weekly_hours: WeeklyHours;
  availability_mode: AvailabilityMode;
  repeating_hours: RepeatingRule[];
  min_notice_hours: number;
  max_days_ahead: number;
  buffer_minutes: number;
  slot_interval_minutes: number;
  confirmation_enabled: boolean;
  confirmation_subject: string;
  confirmation_body: string;
  /** Gmail "Send mail as" alias to send confirmations from; null = the connected address. */
  confirmation_from_email: string | null;
  /** Sender name on confirmations; null = owner_name. */
  confirmation_from_name: string | null;
};

export type LocationType = "google_meet" | "phone" | "in_person" | "custom";

export type EventType = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  /** First offered location; kept for older code. */
  location_type: LocationType;
  location_detail: string | null;
  /** Every location the booker can choose from. */
  location_types: LocationType[];
  location_details: Partial<Record<LocationType, string>>;
  /** Pre-meeting questions asked on the booking page. */
  questions: Question[];
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
  /** The location type the booker chose. */
  location_type: LocationType | null;
  /** The booker's answers to the meeting type's questions. */
  answers: Answer[];
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

export type SupportTag = "content_updates" | "site_enhancements" | "advanced_customization" | "notification_banner";

export type SupportTask = {
  id: string;
  client_id: string | null;
  title: string;
  tag: SupportTag;
  price: number | null;
  scheduled_date: string | null;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  invoiced: boolean;
  invoiced_at: string | null;
  status: WorkStatus;
  recurrence: Recurrence;
  /** Set once the next repeat has been created. */
  next_created: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportSubtask = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
};
