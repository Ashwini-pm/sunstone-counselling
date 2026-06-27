import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sunstone · Faculty Assessment Center',
  description: 'Structured assessment center for recruiting faculty',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
