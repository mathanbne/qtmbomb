// Pure game rules. No Firebase here so they can be unit tested.
import { REMOVED, type Session } from './types'

export type Rng = () => number

/** One bomb per `ratio` players still in, at least 1, and always fewer bombs than players. */
export function bombCount(alive: number, ratio: number): number {
  if (alive < 2) return 0
  return Math.max(1, Math.min(alive - 1, Math.floor(alive / Math.max(1, ratio))))
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Starting holders: `n` different random players. */
export function placeBombs(alive: readonly number[], n: number, rng: Rng = Math.random): number[] {
  return shuffle(alive, rng).slice(0, n)
}

/**
 * Who a bomb goes to when `self` taps PASS. Prefers a player who isn't holding a bomb and
 * didn't just pass it to us; relaxes those only when nobody else is left.
 */
export function pickPassTarget(
  alive: readonly number[],
  holders: Iterable<number>,
  self: number,
  prev: number | null,
  rng: Rng = Math.random,
): number | null {
  const busy = new Set(holders)
  const others = alive.filter((n) => n !== self)
  const tiers = [others.filter((n) => !busy.has(n) && n !== prev), others.filter((n) => !busy.has(n)), others]
  for (const t of tiers) if (t.length > 0) return t[Math.floor(rng() * t.length)]
  return null
}

export interface Explosion {
  out: number[]
  alive: number[]
  winners: number[]
  finished: boolean
}

/** Everyone holding a bomb at zero is out. If that would leave nobody, the last players share the win. */
export function resolveExplosion(alive: readonly number[], holders: Iterable<number>): Explosion {
  const h = new Set(holders)
  const out = alive.filter((n) => h.has(n))
  const left = alive.filter((n) => !h.has(n))
  if (left.length === 0) return { out: [], alive: [...alive], winners: [...alive], finished: true }
  if (left.length === 1) return { out, alive: left, winners: left, finished: true }
  return { out, alive: left, winners: [], finished: false }
}

export const playerLabel = (n: number, roster: Record<string, string>) => {
  const name = roster[String(n)]
  return name ? `#${n} ${name}` : `#${n}`
}

export interface ResultRow {
  number: number
  name: string
  result: string
  /** 1 = winner. Players out in the same round share a place. Removed players have no place. */
  place: number | null
}

export function results(s: Pick<Session, 'roster' | 'alive' | 'outRound' | 'winners'>): ResultRow[] {
  const numbers = Object.keys(s.roster).map(Number)
  const winners = new Set(s.winners)
  const outRound = (n: number) => s.outRound[String(n)]
  // Sort: winners, then still in, then by the round they went out (later is better), removed last.
  const rank = (n: number) => (winners.has(n) ? 1e9 : s.alive.includes(n) ? 1e8 : (outRound(n) ?? -1) === REMOVED ? -1 : outRound(n))
  const sorted = numbers.sort((a, b) => rank(b) - rank(a) || a - b)
  const rows: ResultRow[] = []
  sorted.forEach((n, i) => {
    const r = outRound(n)
    const removed = r === REMOVED && !s.alive.includes(n)
    const prev = rows[i - 1]
    const place = removed ? null : prev && rank(sorted[i - 1]) === rank(n) ? prev.place : i + 1
    rows.push({
      number: n,
      name: s.roster[String(n)],
      result: winners.has(n) ? 'Winner' : s.alive.includes(n) ? 'Still in' : removed ? 'Removed' : `Out in round ${r}`,
      place,
    })
  })
  return rows
}
