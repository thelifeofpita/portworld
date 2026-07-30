'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { debugStore, updateDebug, resetDebug, subscribeDebug, applyCssVars, exportSettingsJSON, BYLINE_LETTERS, BYLINE_GAP_COUNT, FONT_OPTIONS, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX, FONT_WEIGHT_STEP, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP, TRACKING_MIN, TRACKING_MAX, TRACKING_STEP, type FontKey, type DebugState } from '@/lib/debugStore'
import styles from './DebugMenu.module.css'

// Triple-press window — three "d" keydowns must each land within this many ms
// of the previous one, otherwise the sequence resets.
const PRESS_WINDOW_MS = 500

// Reads the live computed value for a CSS var so the color swatch reflects
// reality (not black) while a field is in "auto" mode.
function computedVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function toHex(v: string): string {
  // getComputedStyle can return rgb(...) — <input type=color> requires #hex.
  if (v.startsWith('#')) return v
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return '#000000'
  const [, r, g, b] = m
  return '#' + [r, g, b].map(n => Number(n).toString(16).padStart(2, '0')).join('')
}

interface ColorRowProps {
  label:   string
  varName?: string  // omit for values with no corresponding CSS var (e.g. the 3D model tint)
  fallback: string
  value:    string | null
  onChange: (hex: string) => void
  onAuto?:  () => void
}

function ColorRow({ label, varName, fallback, value, onChange, onAuto }: ColorRowProps) {
  const display = value ?? (varName ? toHex(computedVar(varName, fallback)) : fallback)
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel}>{label}</label>
      <div className={styles.rowControls}>
        <input
          type="color"
          className={styles.swatch}
          value={display}
          onChange={e => onChange(e.target.value)}
        />
        {onAuto && (
          <button
            type="button"
            className={`${styles.autoBtn} ${value === null ? styles.autoBtnActive : ''}`}
            onClick={onAuto}
          >auto</button>
        )}
      </div>
    </div>
  )
}

function FontRow({ label, value, onChange }: { label: string; value: FontKey; onChange: (v: FontKey) => void }) {
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel}>{label}</label>
      <select className={styles.select} value={value} onChange={e => onChange(e.target.value as FontKey)}>
        {(Object.keys(FONT_OPTIONS) as FontKey[]).map(key => (
          <option key={key} value={key}>{FONT_OPTIONS[key].label}</option>
        ))}
      </select>
    </div>
  )
}

interface SliderRowProps {
  label:    string
  value:    number
  min:      number
  max:      number
  step:     number
  format?:  (v: number) => string
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel}>{label}</label>
      <div className={styles.rowControls}>
        <input
          type="range"
          className={styles.slider}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
        />
        <span className={styles.weightValue}>{format ? format(value) : value}</span>
      </div>
    </div>
  )
}

export default function DebugMenu() {
  const [, forceRender] = useReducer((n: number) => n + 1, 0)
  const pressTimes = useRef<number[]>([])
  const [exportState, setExportState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [exportText, setExportText]   = useState<string | null>(null)

  // Copies the current settings as JSON — paste it back to have it baked in
  // as the new hardcoded DEFAULTS in lib/debugStore.ts. Falls back to
  // revealing the JSON in a plain <textarea> (select-all-and-copy by hand)
  // if the async Clipboard API is unavailable/denied/unresponsive — NOT
  // window.prompt(), which is a blocking native dialog that freezes the
  // whole page until manually dismissed. Raced against a short timeout
  // rather than just try/catch: writeText() doesn't always reject when it
  // can't complete (e.g. document lacking focus) — it can hang indefinitely
  // instead, which a plain try/catch never recovers from.
  const handleExport = async () => {
    const json = exportSettingsJSON()
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
    try {
      await Promise.race([navigator.clipboard.writeText(json), timeout])
      setExportState('copied')
      setExportText(null)
    } catch {
      setExportState('error')
      setExportText(json)
    }
    setTimeout(() => setExportState('idle'), 2000)
  }

  useEffect(() => subscribeDebug(forceRender), [])

  // Apply any persisted colors/fonts once, after hydration — doing this at module
  // load instead would mutate <html> before React hydrates and cause a mismatch.
  useEffect(() => { applyCssVars() }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'd' || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      const now = Date.now()
      const times = pressTimes.current.filter(t => now - t < PRESS_WINDOW_MS)
      times.push(now)
      pressTimes.current = times
      if (times.length >= 3) {
        pressTimes.current = []
        updateDebug('menuOpen', !debugStore.menuOpen)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!debugStore.menuOpen) return null

  const set = <K extends keyof DebugState>(key: K) => (value: DebugState[K]) => updateDebug(key, value)

  return (
    <div className={styles.panel} role="dialog" aria-label="Debug menu">
      <div className={styles.header}>
        <span>DEBUG</span>
        <button type="button" className={styles.closeBtn} onClick={() => updateDebug('menuOpen', false)} aria-label="Close">×</button>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Colors</p>
        <ColorRow label="Background"     varName="--bg-color" fallback="#ffffff" value={debugStore.bgColor}
          onChange={set('bgColor')} onAuto={() => set('bgColor')(null)} />
        <ColorRow label="Model"          fallback="#d4d4d4" value={debugStore.modelColor}
          onChange={set('modelColor')} onAuto={() => set('modelColor')(null)} />
        <ColorRow label="Highlight (focused)"   varName="--accent-color"      fallback="#F2DF0C" value={debugStore.accentFocusColor}
          onChange={set('accentFocusColor')} />
        <ColorRow label="Highlight (unfocused)" varName="--accent-base-color" fallback="#F20C1F" value={debugStore.accentBaseColor}
          onChange={set('accentBaseColor')} />
        <ColorRow label="Hover"          varName="--hover-color" fallback="#e01010" value={debugStore.hoverColor}
          onChange={set('hoverColor')} />
        <ColorRow label="Text"           varName="--fg-color" fallback="#0d0d0d" value={debugStore.fgColor}
          onChange={set('fgColor')} onAuto={() => set('fgColor')(null)} />
        <ColorRow label="Text muted"     varName="--fg-muted" fallback="#999999" value={debugStore.fgMutedColor}
          onChange={set('fgMutedColor')} onAuto={() => set('fgMutedColor')(null)} />
        <ColorRow label="Text highlight" varName="--text-highlight-color" fallback="#F2DF0C" value={debugStore.textHighlightColor}
          onChange={set('textHighlightColor')} />
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Fonts</p>
        <FontRow label="Primary" value={debugStore.fontPrimary} onChange={set('fontPrimary')} />
        <SliderRow label="Primary weight" value={debugStore.fontPrimaryWeight}
          min={FONT_WEIGHT_MIN} max={FONT_WEIGHT_MAX} step={FONT_WEIGHT_STEP} onChange={set('fontPrimaryWeight')} />
        <SliderRow label="Primary size" value={debugStore.fontPrimaryScale}
          min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP} format={v => `${Math.round(v * 100)}%`}
          onChange={set('fontPrimaryScale')} />
        <FontRow label="Display" value={debugStore.fontDisplay} onChange={set('fontDisplay')} />
        <SliderRow label="Display weight" value={debugStore.fontDisplayWeight}
          min={FONT_WEIGHT_MIN} max={FONT_WEIGHT_MAX} step={FONT_WEIGHT_STEP} onChange={set('fontDisplayWeight')} />
        <SliderRow label="Display size" value={debugStore.fontDisplayScale}
          min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP} format={v => `${Math.round(v * 100)}%`}
          onChange={set('fontDisplayScale')} />
        <SliderRow label="Tracking" value={debugStore.tracking}
          min={TRACKING_MIN} max={TRACKING_MAX} step={TRACKING_STEP} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(3)}em`}
          onChange={set('tracking')} />
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Byline kerning</p>
        <div className={styles.kernGrid}>
          {Array.from({ length: BYLINE_GAP_COUNT }, (_, i) => (
            <div key={i} className={styles.kernCell}>
              <label className={styles.kernLabel}>{BYLINE_LETTERS[i]}{BYLINE_LETTERS[i + 1]}</label>
              <input
                type="number"
                className={styles.kernInput}
                step={0.005}
                value={debugStore.bylineKerning[i]}
                onChange={e => {
                  const next = [...debugStore.bylineKerning]
                  next[i] = Number(e.target.value)
                  updateDebug('bylineKerning', next)
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <button type="button" className={styles.resetBtn} onClick={handleExport}>
        {exportState === 'copied' ? 'Copied!' : exportState === 'error' ? 'Copy failed — see below' : 'Export settings'}
      </button>
      {exportText && (
        <textarea
          className={styles.exportFallback}
          readOnly
          value={exportText}
          onFocus={e => e.currentTarget.select()}
        />
      )}
      <button type="button" className={styles.resetBtn} onClick={resetDebug}>Reset to defaults</button>
      <p className={styles.hint}>Press D×3 to toggle this menu</p>
    </div>
  )
}
