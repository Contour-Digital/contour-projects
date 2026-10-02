import { notFound } from "next/navigation";
import { loadEventType, loadSettings } from "@/lib/booking/server";
import { toPublic } from "@/lib/booking/publicEventType";
import { BookingWidget } from "@/components/booking/BookingWidget";

export const dynamic = "force-dynamic";

// Framed by the client's website (see public/embed.js). No page chrome or background.
export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [eventType, settings] = await Promise.all([loadEventType(slug), loadSettings()]);
  if (!eventType) notFound();
  return (
    <main className="bg-white">
      <style>{`body{background:#fff}`}</style>
      <BookingWidget eventType={toPublic(eventType)} ownerName={settings.owner_name} embedded />
    </main>
  );
}
