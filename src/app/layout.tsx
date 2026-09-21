import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Montserrat } from 'next/font/google'
import { copy } from '@/lib/copy'
import { siteUrl } from '@/lib/site'
import './globals.css'

const display = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-montserrat',
})

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-sans',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: copy.meta.title, template: `%s · ${copy.meta.title}` },
  description: copy.meta.description,
  applicationName: copy.meta.title,
  // Not indexed until launch (phase 8).
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'es_EC',
    siteName: copy.meta.title,
    title: copy.meta.title,
    description: copy.meta.description,
  },
}

export const viewport: Viewport = {
  themeColor: '#151515',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
