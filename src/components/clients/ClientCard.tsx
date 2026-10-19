import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { Client } from "@/lib/types";
import { CONTACT_LABELS, HOSTING_LABELS, LEAD_SOURCE_LABELS, toUrl } from "@/lib/clients";
import { DomainLogin } from "@/components/clients/DomainLogin";

export function ClientCard({
  client,
  showLink = true,
  onLoginRemoved,
}: {
  client: Client;
  showLink?: boolean;
  /** Pass this to show the reveal-able domain login (client page only). */
  onLoginRemoved?: () => void;
}) {
  const website = client.website && toUrl(client.website);
  const details: [string, React.ReactNode][] = [];
  if (client.preferred_contact) details.push(["Prefers", CONTACT_LABELS[client.preferred_contact]]);
  if (client.lead_source) details.push(["Lead source", LEAD_SOURCE_LABELS[client.lead_source]]);
  if (client.client_since) details.push(["Client since", format(parseISO(client.client_since), "d MMM yyyy")]);
  if (client.domain_location) {
    details.push([
      "Domain",
      client.domain_location === "internal" ? "Internal" : `External${client.domain_registrar ? ` · ${client.domain_registrar}` : ""}`,
    ]);
  }

  return (
    <div className="space-y-1.5 text-sm">
      {client.offboarded_at && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          Former client since {format(parseISO(client.offboarded_at), "d MMM yyyy")}
          {client.offboarding_reason && <div className="mt-0.5 whitespace-pre-wrap text-amber-700">{client.offboarding_reason}</div>}
        </div>
      )}
      <div className="font-medium">{client.company || client.name}</div>
      {client.company && <div className="text-slate-600">{client.name}</div>}
      <SubscriptionBadges client={client} />
      {client.email && (
        <a href={`mailto:${client.email}`} className="block truncate text-brand-strong hover:underline">{client.email}</a>
      )}
      {client.phone && (
        <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="block text-brand-strong hover:underline">{client.phone}</a>
      )}
      {website && (
        <a href={website} target="_blank" rel="noreferrer" className="block truncate text-brand-strong hover:underline">{client.website}</a>
      )}
      {client.google_drive_url && (
        <a href={toUrl(client.google_drive_url)} target="_blank" rel="noreferrer" className="block truncate text-brand-strong hover:underline">
          Google Drive folder ↗
        </a>
      )}
      {client.address && <div className="whitespace-pre-wrap text-slate-600">{client.address}</div>}
      {client.abn && <div className="text-slate-500">ABN {client.abn}</div>}
      {details.length > 0 && (
        <dl className="space-y-0.5 pt-1">
          {details.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
              <dd className="text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {client.domain_login_updated_at &&
        (onLoginRemoved ? (
          <DomainLogin clientId={client.id} savedAt={client.domain_login_updated_at} onRemoved={onLoginRemoved} />
        ) : (
          <div className="text-xs text-slate-500">🔒 Domain login saved (open the client to reveal it)</div>
        ))}
      {client.notes && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-600">{client.notes}</p>}
      {showLink && (
        <Link href={`/clients/${client.id}`} className="inline-block pt-1 text-xs text-slate-500 hover:text-slate-800 hover:underline">
          Open client →
        </Link>
      )}
    </div>
  );
}

export function SubscriptionBadges({ client }: { client: Pick<Client, "hosting_subscription" | "maintenance_subscription"> }) {
  if (!client.hosting_subscription && !client.maintenance_subscription) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {client.hosting_subscription && (
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
          {HOSTING_LABELS[client.hosting_subscription]} hosting
        </span>
      )}
      {client.maintenance_subscription && (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Maintenance</span>
      )}
    </div>
  );
}
