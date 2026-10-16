import { notFound } from "next/navigation";
import { loadEventType, loadSettings } from "@/lib/booking/server";
import { toPublic } from "@/lib/booking/publicEventType";
import { BookingWidget } from "@/components/booking/BookingWidget";
import { Logo } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await loadEventType(slug);
  return { title: t ? `Book a ${t.name}` : "Book a time" };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [eventType, settings] = await Promise.all([loadEventType(slug), loadSettings()]);
  if (!eventType) notFound();
  return (
    <main className="px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-3xl justify-center">
        <Logo className="h-8" />
      </div>
      <BookingWidget eventType={toPublic(eventType)} ownerName={settings.owner_name} />
    </main>
  );
}
