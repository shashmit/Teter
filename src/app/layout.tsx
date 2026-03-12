import type { Metadata } from 'next';
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css';

export const metadata: Metadata = {
  title: 'Teter | Code Sharing Platform',
  description: 'Share your code snippets with a clean, minimal interface.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
          <SpeedInsights />
          <Analytics />
    </html>
  );
}
