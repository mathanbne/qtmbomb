import { describe, expect, it } from 'vitest'
import { bombCount, pickPassTarget, placeBombs, resolveExplosion, results } from './game'

/** Deterministic RNG (mulberry32) so failures reproduce. */
function seeded(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('bombCount', () => {
  it('is one bomb per 8 players', () => {
    expect(bombCount(300, 8)).toBe(37)
    expect(bombCount(40, 8)).toBe(5)
    expect(bombCount(16, 8)).toBe(2)
  })
  it('never drops below 1 while 2 or more are in', () => {
    expect(bombCount(15, 8)).toBe(1)
    expect(bombCount(2, 8)).toBe(1)
  })
  it('is 0 when the game is over', () => {
    expect(bombCount(1, 8)).toBe(0)
    expect(bombCount(0, 8)).toBe(0)
  })
  it('always leaves at least one player without a bomb', () => {
    expect(bombCount(4, 1)).toBe(3)
    expect(bombCount(2, 1)).toBe(1)
  })
})

describe('placeBombs', () => {
  it('picks distinct players who are still in', () => {
    const alive = range(300)
    for (let seed = 1; seed < 50; seed++) {
      const holders = placeBombs(alive, 37, seeded(seed))
      expect(holders).toHaveLength(37)
      expect(new Set(holders).size).toBe(37)
      for (const h of holders) expect(alive).toContain(h)
    }
  })
})

describe('pickPassTarget', () => {
  it('never passes to yourself', () => {
    const rng = seeded(7)
    for (let i = 0; i < 500; i++) expect(pickPassTarget([1, 2, 3], [1], 1, null, rng)).not.toBe(1)
  })
  it('avoids players already holding a bomb and the player who just passed it', () => {
    const rng = seeded(3)
    for (let i = 0; i < 500; i++) expect(pickPassTarget([1, 2, 3, 4, 5], [1, 2, 3], 1, 4, rng)).toBe(5)
  })
  it('passes back to the previous holder when they are the only free player', () => {
    expect(pickPassTarget([1, 2], [1], 1, 2, seeded(1))).toBe(2)
  })
  it('passes to a bomb holder only when everyone else has one', () => {
    expect(pickPassTarget([1, 2, 3], [1, 2, 3], 1, null, seeded(1))).not.toBe(1)
  })
  it('only picks players who are still in', () => {
    const rng = seeded(9)
    for (let i = 0; i < 200; i++) expect([2, 5, 9]).toContain(pickPassTarget([2, 5, 9, 11], [11], 11, null, rng))
  })
  it('returns null when nobody else is in', () => {
    expect(pickPassTarget([1], [1], 1, null)).toBeNull()
  })
  it('spreads passes across everyone free', () => {
    const rng = seeded(11)
    const seen = new Set<number | null>()
    for (let i = 0; i < 500; i++) seen.add(pickPassTarget(range(10), [1], 1, null, rng))
    expect(seen).toEqual(new Set(range(10).slice(1)))
  })
})

describe('resolveExplosion', () => {
  it('knocks out the holders', () => {
    expect(resolveExplosion([1, 2, 3, 4, 5], [2, 4])).toEqual({ out: [2, 4], alive: [1, 3, 5], winners: [], finished: false })
  })
  it('counts a player holding two bombs once', () => {
    expect(resolveExplosion([1, 2, 3, 4], [2, 2]).out).toEqual([2])
  })
  it('ignores holders who are no longer in (removed by the host)', () => {
    expect(resolveExplosion([1, 2, 3], [9]).out).toEqual([])
  })
  it('crowns the last player standing', () => {
    expect(resolveExplosion([4, 7], [7])).toEqual({ out: [7], alive: [4], winners: [4], finished: true })
  })
  it('makes the last players share the win if they all explode together', () => {
    expect(resolveExplosion([4, 7], [4, 7])).toEqual({ out: [], alive: [4, 7], winners: [4, 7], finished: true })
  })
})

describe('results', () => {
  it('ranks winner, then later rounds, with ties sharing a place and removed players last', () => {
    const rows = results({
      roster: { '1': 'Ana', '2': 'Ben', '3': 'Cy', '4': 'Dee', '5': 'Eve' },
      alive: [3],
      winners: [3],
      outRound: { '1': 1, '2': 2, '4': 2, '5': 0 },
    })
    expect(rows.map((r) => [r.number, r.place, r.result])).toEqual([
      [3, 1, 'Winner'],
      [2, 2, 'Out in round 2'],
      [4, 2, 'Out in round 2'],
      [1, 4, 'Out in round 1'],
      [5, null, 'Removed'],
    ])
  })
})
