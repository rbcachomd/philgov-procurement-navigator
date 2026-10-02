import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'PhilGov Procurement Navigator',
  authors: [{ name: 'Richard Ronald B. Cacho, MD, MHA' }],
  creator: 'Richard Ronald B. Cacho, MD, MHA',
  publisher: 'Richard Ronald B. Cacho, MD, MHA',
  title: 'PhilGov Procurement Navigator',
  description:
    'RAG assistant grounded in the IRR of RA 12009 (New Government Procurement Act) and the 2016 Revised IRR of RA 9184, with section- and page-level citations.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,500..700;1,8..60,500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
