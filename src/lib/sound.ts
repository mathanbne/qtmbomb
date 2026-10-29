// All sounds are synthesised with Web Audio, so there are no files to license or download.
// Browsers (iOS especially) only allow audio after a tap, so call unlockAudio() from a click handler.

let ctx: AudioContext | null = null
let master: GainNode | null = null

const VOLUME = 0.9
const MUTE_KEY = 'bomb-muted'

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

let muted = loadMuted()

/** Remembered on this device, so a reload keeps the choice. */
export function setMuted(m: boolean) {
  muted = m
  if (master) master.gain.value = m ? 0 : VOLUME
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0')
  } catch {
    // ignore: private mode
  }
}

export const isMuted = () => muted

/**
 * Call from inside a tap. Never throws: a phone without Web Audio still has to be able to join and play (silently).
 * Resolves once the browser has (or hasn't) let the audio start.
 */
export async function unlockAudio(): Promise<void> {
  try {
    // iOS 17+: play like a media app, so the ring/silent switch doesn't mute the game.
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : VOLUME
      master.connect(ctx.destination)
    }
    // A silent blip inside the tap is what actually unlocks iOS. It must happen before any await.
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(master!)
    src.start()
    // iOS uses "interrupted" as well as "suspended" (e.g. after the phone was locked).
    if (ctx.state !== 'running') await ctx.resume()
  } catch {
    // No sound on this device; the game still works.
  }
}

export const audioReady = () => ctx?.state === 'running'

/** For the "tap for sound" button, so a stuck state is visible. */
export const audioState = () => (ctx ? ctx.state : 'none')

function tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}) {
  if (!ctx || !master) return
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = opts.type ?? 'square'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
  g.gain.setValueAtTime(opts.gain ?? 0.2, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise(at: number, dur: number, opts: { gain?: number; from?: number; to?: number } = {}) {
  if (!ctx || !master) return
  const t = ctx.currentTime + at
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(opts.from ?? 3000, t)
  filter.frequency.exponentialRampToValueAtTime(opts.to ?? 100, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(opts.gain ?? 0.8, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(g).connect(master)
  src.start(t)
}

export const sounds = {
  /** The bomb just landed on you. */
  alarm() {
    for (let i = 0; i < 4; i++) {
      tone(988, i * 0.2, 0.1, { gain: 0.25 })
      tone(740, i * 0.2 + 0.1, 0.1, { gain: 0.25 })
    }
  },
  tick(urgent = false) {
    tone(urgent ? 1800 : 1200, 0, 0.04, { type: 'triangle', gain: urgent ? 0.35 : 0.2 })
  },
  /** You passed it on. */
  whoosh() {
    noise(0, 0.35, { gain: 0.5, from: 600, to: 4000 })
  },
  blast() {
    noise(0, 2.2, { gain: 1, from: 4000, to: 60 })
    tone(120, 0, 1.2, { type: 'sine', gain: 0.9, to: 30 })
    tone(60, 0.05, 1.6, { type: 'sine', gain: 0.7, to: 25 })
  },
  /** Round start on the projector. */
  start() {
    tone(523, 0, 0.12, { gain: 0.2 })
    tone(784, 0.14, 0.25, { gain: 0.2 })
  },
  fanfare() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.15, 0.3, { type: 'triangle', gain: 0.3 }))
    tone(1047, 0.6, 0.9, { type: 'triangle', gain: 0.3 })
  },
}
