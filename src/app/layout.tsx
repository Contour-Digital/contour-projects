import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Contour Digital", template: "%s · Contour Digital" },
  description: "Client projects and bookings for Contour Digital.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
