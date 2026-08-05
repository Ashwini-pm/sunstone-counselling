import type { Metadata, Viewport } from 'next'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sunstone · Lead Response Center',
  description: 'Video question and response platform for NSAT and CSAT leads',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Leads answer on phones. Allow zoom (accessibility) but keep the default
  // scale fixed so iOS does not zoom when a text field is focused.
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
