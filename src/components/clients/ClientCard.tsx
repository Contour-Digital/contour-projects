import Link from "next/link";
import type { Client } from "@/lib/types";

export function ClientCard({ client, showLink = true }: { client: Client; showLink?: boolean }) {
  const website = client.website && (client.website.startsWith("http") ? client.website : `https://${client.website}`);
  return (
    <div className="space-y-1.5 text-sm">
      <div className="font-medium">{client.company || client.name}</div>
      {client.company && <div className="text-slate-600">{client.name}</div>}
      {client.email && (
        <a href={`mailto:${client.email}`} className="block truncate text-brand hover:underline">{client.email}</a>
      )}
      {client.phone && (
        <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="block text-brand hover:underline">{client.phone}</a>
      )}
      {website && (
        <a href={website} target="_blank" rel="noreferrer" className="block truncate text-brand hover:underline">{client.website}</a>
      )}
      {client.address && <div className="whitespace-pre-wrap text-slate-600">{client.address}</div>}
      {client.abn && <div className="text-slate-500">ABN {client.abn}</div>}
      {client.notes && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-600">{client.notes}</p>}
      {showLink && (
        <Link href={`/clients/${client.id}`} className="inline-block pt-1 text-xs text-slate-500 hover:text-slate-800 hover:underline">
          Open client →
        </Link>
      )}
    </div>
  );
}
