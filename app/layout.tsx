import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OurHouse",
  description: "Your household, together. Private meals, lists, chores and shared expenses.",
  icons: {
    icon: "/icons/ourhouse-192.png",
    shortcut: "/icons/ourhouse-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
