// Static file server for the ./out export, for local measurement only.
//
//   node scripts/serve-static.mjs            # http://127.0.0.1:3002
//   PORT=3003 ROOT=out node scripts/serve-static.mjs
//
// Supports HTTP byte ranges like GitHub Pages does. `python3 -m http.server`
// does not: media there is not seekable, so every media-clock seek landed at
// 0 and re-fired, and Playground measurements were of a broken host rather
// than of the site.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PORT || 3002)
const ROOT = path.resolve(process.env.ROOT || 'out')

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf',
  '.map': 'application/json',
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0])
  let file = path.join(ROOT, clean)
  if (!file.startsWith(ROOT)) return null
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`
  return fs.existsSync(file) ? file : null
}

http.createServer((req, res) => {
  const file = resolveFile(req.url || '/')
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }
  const size = fs.statSync(file).size
  const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1])
    let end = range[1] === '' || range[2] === '' ? size - 1 : Number(range[2])
    start = Math.max(0, start)
    end = Math.min(size - 1, end)
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    if (req.method === 'HEAD') { res.end(); return }
    fs.createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  if (req.method === 'HEAD') { res.end(); return }
  fs.createReadStream(file).pipe(res)
}).listen(PORT, '127.0.0.1', () => console.log(`Serving ${ROOT} on http://127.0.0.1:${PORT}`))
