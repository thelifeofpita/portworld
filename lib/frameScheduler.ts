/** One animation frame for all DOM subscribers. Reads run before writes. */
type Job = { read?: () => void; write: (now: number) => void }
const jobs = new Set<Job>()
let frame = 0
function tick(now: number) {
  frame = 0
  for (const job of jobs) job.read?.()
  for (const job of jobs) job.write(now)
  start()
}
function start() { if (!frame && jobs.size && !document.hidden) frame = requestAnimationFrame(tick) }
function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0 } else start() }
export function subscribeFrame(write: Job['write'], read?: Job['read']) {
  const job = { read, write }; jobs.add(job)
  if (jobs.size === 1) document.addEventListener('visibilitychange', visibility)
  start()
  return () => { jobs.delete(job); if (!jobs.size) { cancelAnimationFrame(frame); frame = 0; document.removeEventListener('visibilitychange', visibility) } }
}
