/** Hysteresis uses elapsed time, so 30/60/120Hz displays behave consistently. */
export class RenderQuality {
  readonly scales: number[]
  tier: number
  private slow = 0
  private fast = 0
  private cooldown = 0
  constructor(mobile: boolean) { this.scales = mobile ? [.75, 1, 1.5] : [1, 1.5, 2]; this.tier = mobile ? 1 : 2 }
  sample(dt: number) {
    if (dt <= 0 || dt > .25) { this.slow = this.fast = 0; return false }
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.slow = dt > .021 ? this.slow + dt : Math.max(0, this.slow - dt / 2)
    this.fast = dt < .018 ? this.fast + dt : 0
    if (this.cooldown) return false
    const previous = this.tier
    if (this.slow > 2.5 && this.tier > 0) this.tier--
    else if (this.fast > 12 && this.tier < 2) this.tier++
    if (previous === this.tier) return false
    this.slow = this.fast = 0; this.cooldown = 8
    return true
  }
  get scale() { return this.scales[this.tier] }
  get shadowSize() { return [512, 1024, 2048][this.tier] }
}
