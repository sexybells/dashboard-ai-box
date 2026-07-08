import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Box Dashboard",
  description: "Local LAN dashboard for AI Box webhook alarms"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
