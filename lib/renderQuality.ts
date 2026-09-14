/** Hysteresis uses elapsed time, so 30/60/120Hz displays behave consistently. */
export class RenderQuality {
  readonly scales: number[]
  tier: number
  private slow = 0
  private fast = 0
  private cooldown = 0
  private clock = 0
  // Two-second windows catch frequent small misses (a steady 50-58fps) that
  // never add up to the long-frame budget below: more than one frame in ten
  // over 17.5ms steps quality down.
  private windowTime = 0
  private windowFrames = 0
  private windowMisses = 0
  // A tier that could not hold its frame rate is not retried until its
  // lockout expires, and each repeat failure doubles the lockout, so a GPU
  // that sits right at a tier's limit settles instead of oscillating (every
  // change reallocates render targets and redraws the shadow map).
  private readonly lockedUntil = [0, 0, 0]
  private readonly lockout = [60, 60, 60]
  // Both paths start one step below their ceiling (desktop 1.5x, mobile 1x)
  // and earn the top tier only after sustained headroom.
  constructor(mobile: boolean) { this.scales = mobile ? [.75, 1, 1.5] : [1, 1.5, 2]; this.tier = 1 }
  sample(dt: number) {
    if (dt <= 0 || dt > .25) { this.slow = this.fast = 0; this.windowTime = this.windowFrames = this.windowMisses = 0; return false }
    this.clock += dt
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.slow = dt > .021 ? this.slow + dt : Math.max(0, this.slow - dt / 2)
    this.fast = dt < .018 ? this.fast + dt : 0
    this.windowTime += dt
    this.windowFrames++
    if (dt > .0175) this.windowMisses++
    let frequentMisses = false
    if (this.windowTime >= 2) {
      frequentMisses = this.windowMisses / this.windowFrames > .1
      this.windowTime = this.windowFrames = this.windowMisses = 0
    }
    if (this.cooldown) return false
    const previous = this.tier
    if ((this.slow > 2.5 || frequentMisses) && this.tier > 0) {
      this.lockedUntil[this.tier] = this.clock + this.lockout[this.tier]
      this.lockout[this.tier] *= 2
      this.tier--
    } else if (this.fast > 12 && this.tier < 2 && this.clock >= this.lockedUntil[this.tier + 1]) {
      this.tier++
    }
    if (previous === this.tier) return false
    this.slow = this.fast = 0; this.cooldown = 8
    this.windowTime = this.windowFrames = this.windowMisses = 0
    return true
  }
  get scale() { return this.scales[this.tier] }
  get shadowSize() { return [512, 1024, 2048][this.tier] }
}
