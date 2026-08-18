import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Next's built-in dev-server image optimizer (Turbopack, next dev) hangs
  // indefinitely on most concurrent requests when several <Image priority>
  // components mount at once (reproduced cold in both a private Chrome
  // window and Firefox: 5 of 6 project thumbnails never resolved, while
  // curling the same /_next/image URLs directly — even all 6 in parallel —
  // always returned in well under 100ms, so the images/server themselves
  // are fine). All images here are already pre-sized/compressed .webp
  // files, so skipping Next's optimizer just means serving them as-is —
  // the same as a plain <img> — rather than depending on a buggy pipeline
  // for a marginal responsive-sizing win.
  images: {
    unoptimized: true,
    // Next 16 warns for any quality not listed here, even with unoptimized:true
    // (where quality is inert — the .webp files are served as authored). The
    // <Image quality={90}> call sites are left as-is rather than stripped, so
    // that turning the optimizer back on keeps the intended quality.
    qualities: [75, 90],
  },
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:file*.woff2',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:file*.ttf',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Self-hosted environment map for the 3D scene (see Scene.tsx) — a
        // content-stable ~1.6MB asset, so it gets the same immutable cache as
        // the model rather than being re-fetched on every visit.
        source: '/env/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/playground/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/projects/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/about/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
};

export default nextConfig;
