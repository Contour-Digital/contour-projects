import { googleConfigured, siteUrl } from "@/lib/google";
import { BookingSettingsView } from "./BookingSettingsView";

export const metadata = { title: "Booking page" };

export default function BookingSettingsPage() {
  return <BookingSettingsView googleConfigured={googleConfigured()} siteUrl={siteUrl()} />;
}
