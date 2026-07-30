import type { Metadata } from 'next'
import './globals.css'
import { projectsContent } from '@/content/projectsContent'
import DebugMenu from '@/components/ui/DebugMenu'

export const metadata: Metadata = {
  title: "Pita's goods",
  description: 'Creatively misdirected.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Start fetching the model and fonts as early as possible */}
        <link rel="preload" href="/models/modelSeparated.glb" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/AltGothicATFBlack.otf" as="font" type="font/otf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/InterVariable.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/HemingVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Preload project thumbnails so they're ready before the user rotates to zone 0 */}
        {projectsContent.map(p => p.thumb
          ? <link key={p.thumb} rel="preload" as="image" href={p.thumb} />
          : null
        )}
      </head>
      <body suppressHydrationWarning>
        {children}
        <DebugMenu />
      </body>
    </html>
  )
}
