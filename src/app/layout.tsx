import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bảng điều khiển AI Box",
  description: "Bảng điều khiển nội bộ theo dõi cảnh báo webhook AI Box"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
