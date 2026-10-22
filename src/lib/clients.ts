import type { ContactMethod, DomainLocation, HostingSubscription, LeadSource } from "@/lib/types";

export const HOSTING_LABELS: Record<HostingSubscription, string> = {
  standard: "Standard",
  ecommerce: "eCommerce",
  non_profit: "Non-profit",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Website",
  social_media: "Social media",
  referral: "Referral",
  outreach: "Outreach",
  existing_client: "Existing client",
  networking: "Networking",
};

export const CONTACT_LABELS: Record<ContactMethod, string> = {
  email: "Email",
  phone: "Phone",
  text: "Text message",
};

export const DOMAIN_LABELS: Record<DomainLocation, string> = {
  internal: "Internal",
  external: "External",
};

/** Adds https:// when a link was saved without it. */
export function toUrl(value: string) {
  return value.startsWith("http") ? value : `https://${value}`;
}

/** A to Z by the name a client is shown under: the business name, or the person's name if there isn't one. */
export function byClientName(a: { name: string; company: string | null }, b: { name: string; company: string | null }) {
  return (a.company || a.name).localeCompare(b.company || b.name, "en", { sensitivity: "base", numeric: true });
}
