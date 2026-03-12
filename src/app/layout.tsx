import type { Metadata } from 'next';
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://teter.vercel.app';

export const metadata: Metadata = {
  title: {
    default: 'Teter - Share Code & Text Snippets Instantly',
    template: '%s | Teter',
  },
  description:
    'Teter is a free, fast code and text sharing platform. Create multi-file snippets, organize with folders, and share via a short link. No signup required.',
  keywords: [
    'code sharing',
    'text sharing',
    'paste bin',
    'pastebin alternative',
    'code snippets',
    'share code online',
    'code collaboration',
    'text snippets',
    'snippet sharing',
    'multi-file paste',
    'developer tools',
  ],
  authors: [{ name: 'Teter' }],
  creator: 'Teter',
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Teter',
    title: 'Teter - Share Code & Text Snippets Instantly',
    description:
      'Free, fast code and text sharing. Create multi-file snippets, organize with folders, and share via a short link. No signup required.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Teter - Share Code & Text Snippets Instantly',
    description:
      'Free, fast code and text sharing. Create multi-file snippets and share via a short link.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
