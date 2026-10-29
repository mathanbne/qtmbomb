import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Countdown, Logo, Spinner } from '../components/Brand'
import { celebrate } from '../lib/celebrate'
import { EVENT } from '../lib/event'
import { useAnonymousUser, useBombs, usePrevious, useRemaining, useSession, useWakeLock } from '../lib/hooks'
import { REMOVED, type Session } from '../lib/types'

type Filter = 'all' | 'in' | 'out'

/**
 * Audience board: every player as a tile, green while in, red with 💣 while holding a bomb, grey once out.
 * On a big screen the whole roster is sized to fit without scrolling; on a phone it scrolls and can be searched.
 */
export default function Board() {
  useAnonymousUser() // for the clock sync
  const { session, loading } = useSession()
  const bombs = useBombs(session)
  const remaining = useRemaining(session)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  useWakeLock(true)

  const status = session?.status
  const prevStatus = usePrevious(status)
  useEffect(() => {
    if (status === 'FINISHED' && prevStatus === 'LIVE') setTimeout(() => celebrate(true), 1200)
  }, [status, prevStatus])

  if (loading) return <div className="flex min-h-dvh items-center justify-center"><Spinner className="h-10 w-10" /></div>
  if (!session) return <div className="flex min-h-dvh items-center justify-center text-xl text-plum">No game yet.</div>

  const holders = new Set(status === 'LIVE' ? bombs.map((b) => b.holder) : [])
  const numbers = Object.keys(session.roster).map(Number).sort((a, b) => a - b)
  const inCount = session.alive.length
  const outCount = numbers.length - inCount
  const q = search.trim().toLowerCase()
  const shown = numbers.filter((n) => {
    const isIn = session.alive.includes(n)
    if (filter === 'in' && !isIn) return false
    if (filter === 'out' && isIn) return false
    return !q || String(n) === q.replace('#', '') || session.roster[String(n)].toLowerCase().includes(q)
  })

  return (
    <div className="flex h-dvh flex-col bg-plum-dark text-white">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-plum px-4 py-2.5 md:px-6">
        <div className="flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-lg font-black md:text-2xl">💣 Pass the Bomb</span>
          <span className="hidden text-sm font-semibold text-gold-light lg:inline">{EVENT.name} · {EVENT.hosts}</span>
        </div>
        <div className="flex items-center gap-4 text-lg font-bold md:text-2xl">
          <span>{session.status === 'LOBBY' ? 'Lobby' : session.status === 'FINISHED' ? 'Game over' : `Round ${session.round}`}</span>
          {session.status === 'LIVE' && <Countdown ms={remaining} className="text-2xl md:text-4xl" />}
        </div>
        <div className="flex gap-3 text-lg font-black md:text-2xl">
          <span className="rounded-lg bg-safe px-3 py-0.5">In: {inCount}</span>
          <span className="rounded-lg bg-neutral-600 px-3 py-0.5">Out: {outCount}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(['all', 'in', 'out'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1 text-sm font-bold capitalize ${filter === f ? 'bg-cream text-plum' : 'bg-white/10'}`}>
              {f}
            </button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a name"
            className="w-32 rounded-lg bg-white/10 px-3 py-1 text-sm placeholder:text-white/50 md:w-44" />
        </div>
      </header>

      {(status === 'EXPLODED' || status === 'FINISHED') && session.eliminatedThisRound.length > 0 && (
        <div key={session.round} className="animate-shake flex flex-wrap items-center gap-2 bg-orange-600 px-4 py-2 text-sm font-bold md:px-6 md:text-lg">
          💥 Out this round:
          {session.eliminatedThisRound.map((n) => (
            <span key={n} className="rounded-full bg-black/25 px-2.5 py-0.5">#{n} {session.roster[String(n)]}</span>
          ))}
        </div>
      )}
      {status === 'FINISHED' && (
        <div className="bg-gold px-4 py-2 text-center text-xl font-black text-plum-dark md:text-3xl">
          🏆 Winner: {session.winners.map((n) => `#${n} ${session.roster[String(n)]}`).join(' & ')}
        </div>
      )}

      {numbers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-2xl text-white/60">Waiting for players to join…</div>
      ) : (
        <TileGrid numbers={shown} session={session} holders={holders} />
      )}
    </div>
  )
}

/** Picks the column count that makes the tiles as big as possible while all of them fit. */
function useFit(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fit = useMemo(() => {
    const GAP = 6
    const ASPECT = 1.5 // tile width / height
    let best = { cols: 1, tileH: 0 }
    if (count === 0 || size.w === 0) return best
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols)
      const w = (size.w - GAP * (cols - 1)) / cols
      const h = Math.min((size.h - GAP * (rows - 1)) / rows, w / ASPECT)
      if (h > best.tileH) best = { cols, tileH: h }
    }
    return best
  }, [count, size])
  // Phones: a fixed, readable grid that scrolls instead.
  const scroll = size.w > 0 && (size.w < 768 || fit.tileH < 28)
  return { ref, scroll, ...fit }
}

function TileGrid({ numbers, session, holders }: { numbers: number[]; session: Session; holders: Set<number> }) {
  const { ref, scroll, cols, tileH } = useFit(numbers.length)
  const alive = new Set(session.alive)
  const justOut = new Set(session.status === 'LIVE' ? [] : session.eliminatedThisRound)
  const winners = new Set(session.status === 'FINISHED' ? session.winners : [])

  return (
    <div ref={ref} className={`flex-1 p-2 md:p-3 ${scroll ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      <div
        className="grid gap-1.5"
        style={scroll ? { gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' } : { gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {numbers.map((n) => {
          const name = session.roster[String(n)]
          const isIn = alive.has(n)
          const out = session.outRound[String(n)]
          let cls = 'bg-safe text-white'
          if (winners.has(n)) cls = 'bg-gold text-plum-dark ring-4 ring-inset ring-gold-light'
          else if (isIn && holders.has(n)) cls = 'bg-danger text-white animate-holder'
          else if (justOut.has(n)) cls = 'bg-neutral-700 text-white/70 animate-shake'
          else if (!isIn) cls = 'bg-neutral-800 text-neutral-500'
          return (
            <div
              key={n}
              className={`relative flex flex-col items-center justify-center overflow-hidden rounded-lg px-1 leading-tight transition-colors duration-500 ${cls}`}
              style={scroll ? { height: 64 } : { height: tileH }}
            >
              <span className={`font-black tabular-nums ${isIn ? '' : 'line-through'}`} style={{ fontSize: scroll ? 20 : tileH * 0.36 }}>
                {holders.has(n) && isIn ? '💣' : ''}#{n}
              </span>
              <span className="w-full truncate text-center font-semibold" style={{ fontSize: scroll ? 12 : Math.max(9, tileH * 0.2) }}>
                {name}
              </span>
              {!isIn && out !== undefined && (
                <span className="absolute right-1 top-0.5 font-bold opacity-80" style={{ fontSize: scroll ? 10 : Math.max(8, tileH * 0.15) }}>
                  {out === REMOVED ? '✕' : `R${out}`}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
