import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'thelifeofpita',
  description: 'Creatively misdirected.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* Start fetching the model and fonts as early as possible */}
        <link rel="preload" href="/models/modelSeparated.glb" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/YoungSerif-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/HemingVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
