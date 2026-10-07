// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crisis Resource Router",
  description: "Deterministic, offline-first routing for human needs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}