import { NextResponse } from 'next/server'
import { pickPalette } from '@/lib/paletteSource'

// The palette for the INITIAL page load is inlined during SSR (see
// app/layout.tsx) — this route only serves rerolls and the prefetched
// "next palette" the byline hover/click uses.
export async function GET() {
  const palette = await pickPalette()
  return NextResponse.json(palette, { headers: { 'Cache-Control': 'no-store' } })
}
