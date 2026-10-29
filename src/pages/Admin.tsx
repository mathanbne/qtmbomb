import { onAuthStateChanged, type User } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Countdown, Logo, Spinner } from '../components/Brand'
import {
  assignNumbers,
  explodeRound,
  isHost,
  removePlayer,
  resetSession,
  seedFakePlayers,
  setRegistration,
  signInHost,
  signOutHost,
  startRound,
  updateSettings,
  watchPendingPlayers,
} from '../lib/api'
import { syncClock } from '../lib/clock'
import { downloadText, resultsCsv } from '../lib/csv'
import { auth, firebaseConfigured } from '../lib/firebase'
import { bombCount, playerLabel } from '../lib/game'
import { useBombs, useServerNow, useSession } from '../lib/hooks'
import { DURATIONS, REMOVED, type Session } from '../lib/types'

/** Wait this long after zero before reading the bombs, so passes made just before zero have landed. */
const EXPLODE_GRACE_MS = 1000
/** Break between rounds when auto-advance is on. */
const AUTO_ADVANCE_MS = 8000

export default function Admin() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [host, setHost] = useState<boolean | null>(null)

  useEffect(() => {
    if (!firebaseConfigured) return
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setHost(null)
      if (u && !u.isAnonymous) setHost(await isHost(u.uid).catch(() => false))
    })
  }, [])

  if (!firebaseConfigured) return <Shell><p className="p-8">Firebase settings are missing (see README).</p></Shell>
  if (user === undefined || (user && !user.isAnonymous && host === null)) {
    return <Shell><div className="flex justify-center p-16"><Spinner className="h-10 w-10" /></div></Shell>
  }
  if (!user || user.isAnonymous) return <Shell><Login /></Shell>
  if (!host) {
    return (
      <Shell>
        <div className="mx-auto max-w-md p-8 text-center">
          <p className="font-semibold text-maroon">{user.email} isn't set up as a host.</p>
          <p className="mt-2 text-sm text-maroon/70">Add a document at hosts/{user.uid} in Firestore (see README).</p>
          <button onClick={signOutHost} className="mt-4 underline">Sign out</button>
        </div>
      </Shell>
    )
  }
  return <HostConsole uid={user.uid} />
}

function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-3 bg-maroon px-5 py-3 text-cream">
        <Logo className="h-9 w-9" />
        <span className="flex-1 text-lg font-extrabold">QTM Pass the Bomb · Host</span>
        {right}
      </header>
      {children}
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInHost(email, password)
    } catch {
      setError('Wrong email or password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 flex max-w-sm flex-col gap-3 px-6">
      <h1 className="text-2xl font-bold text-maroon">Host sign in</h1>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="username"
        className="rounded-lg border-2 border-maroon/20 px-3 py-2.5" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"
        className="rounded-lg border-2 border-maroon/20 px-3 py-2.5" />
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-maroon py-2.5 font-bold text-cream disabled:opacity-60">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function HostConsole({ uid }: { uid: string }) {
  const { session, loading, error } = useSession()
  const bombs = useBombs(session)
  const now = useServerNow(250)
  const [pending, setPending] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const assigning = useRef(false)
  const exploded = useRef<string | null>(null)
  const advanced = useRef<string | null>(null)

  const fail = useCallback((e: unknown) => setToast(e instanceof Error ? e.message : String(e)), [])
  const run = (fn: () => Promise<unknown>) => () => fn().catch(fail)

  useEffect(() => {
    syncClock(uid).catch(() => setToast("Couldn't sync the clock with the server; using this laptop's clock."))
  }, [uid])

  // Hand out numbers as people join.
  const sessionId = session?.sessionId
  useEffect(() => {
    if (!sessionId) return
    return watchPendingPlayers(sessionId, setPending)
  }, [sessionId])
  // Bumped after each batch so anyone who joined while it was running gets picked up.
  const [assignRuns, setAssignRuns] = useState(0)
  useEffect(() => {
    if (pending.length === 0 || assigning.current) return
    assigning.current = true
    assignNumbers(pending)
      .then(() => 300)
      .catch((e) => {
        fail(e)
        return 3000 // back off instead of hammering a failing write
      })
      .then((delay) => {
        assigning.current = false
        setTimeout(() => setAssignRuns((r) => r + 1), delay)
      })
  }, [pending, assignRuns, fail])

  // This page is the game master: it sets off the bombs once the countdown is over.
  const explodesAt = session?.status === 'LIVE' ? (session.explodesAt?.toMillis() ?? null) : null
  const roundKey = session ? `${session.sessionId}_${session.round}` : null
  useEffect(() => {
    if (explodesAt === null || now < explodesAt + EXPLODE_GRACE_MS || exploded.current === roundKey) return
    exploded.current = roundKey
    explodeRound().catch((e) => {
      exploded.current = null // retry on the next tick
      fail(e)
    })
  }, [now, explodesAt, roundKey, fail])

  // Auto-advance to the next round after a short break.
  const autoAdvanceDue = session?.status === 'EXPLODED' && session.autoAdvance && advanced.current !== roundKey
  useEffect(() => {
    if (!autoAdvanceDue) return
    const t = setTimeout(() => {
      advanced.current = roundKey
      startRound().catch(fail)
    }, AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [autoAdvanceDue, roundKey, fail])

  if (loading) return <Shell><div className="flex justify-center p-16"><Spinner className="h-10 w-10" /></div></Shell>

  const signOutButton = <button onClick={signOutHost} className="text-sm text-cream/80 underline">Sign out</button>

  if (error || !session) {
    return (
      <Shell right={signOutButton}>
        <div className="mx-auto max-w-md p-8 text-center">
          {error && <p className="mb-4 text-red-700">{error}</p>}
          <p className="mb-4">No game has been set up yet.</p>
          <button onClick={run(() => resetSession())} className="rounded-lg bg-maroon px-6 py-3 font-bold text-cream">Create game</button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell right={signOutButton}>
      <div className="mx-auto grid max-w-6xl gap-5 p-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <RoundPanel session={session} bombs={bombs} now={now} pending={pending.length} run={run} />
          <Settings session={session} run={run} />
          <div className="flex flex-wrap gap-2 text-sm">
            {[['/screen', '📽 Projector screen'], ['/board', '📋 In / out board'], ['/poster', '🖨 QR poster']].map(([href, text]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-3 py-2 font-semibold text-maroon shadow-sm">{text}</a>
            ))}
            <button onClick={() => downloadText(`pass-the-bomb-${session.sessionId}.csv`, resultsCsv(session))}
              className="rounded-lg bg-white px-3 py-2 font-semibold text-maroon shadow-sm">⬇ Export results</button>
            <button
              onClick={() => confirm('Start a brand-new game? Everyone will need to join again.') && run(() => resetSession(session))()}
              className="rounded-lg bg-white px-3 py-2 font-semibold text-red-700 shadow-sm">Reset…</button>
            {import.meta.env.DEV && (
              <button onClick={run(() => seedFakePlayers(50))} className="rounded-lg bg-neutral-800 px-3 py-2 font-semibold text-white">
                DEV: +50 fake players
              </button>
            )}
          </div>
        </div>
        <PlayerList session={session} holders={session.status === 'LIVE' ? bombs.map((b) => b.holder) : []} run={run} />
      </div>
      {toast && (
        <button onClick={() => setToast(null)} className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-red-700 px-5 py-3 font-semibold text-white shadow-xl">
          {toast} ✕
        </button>
      )}
    </Shell>
  )
}

type Run = (fn: () => Promise<unknown>) => () => void

function RoundPanel({ session, bombs, now, pending, run }: {
  session: Session
  bombs: { holder: number; passes: number }[]
  now: number
  pending: number
  run: Run
}) {
  const { status, round, roster, alive } = session
  const label = (n: number) => playerLabel(n, roster)
  const nextBombs = bombCount(alive.length, session.bombRatio)
  const canStart = (status === 'LOBBY' || status === 'EXPLODED') && alive.length >= 2 && pending === 0

  const startButton = (
    <button onClick={run(startRound)} disabled={!canStart}
      className="rounded-xl bg-danger px-6 py-4 text-xl font-black text-white shadow-lg disabled:opacity-40">
      💣 Start round {round + 1} · {session.durationSec}s · {nextBombs} {nextBombs === 1 ? 'bomb' : 'bombs'}
    </button>
  )

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-black text-maroon">
          {status === 'LOBBY' ? 'Lobby' : status === 'FINISHED' ? 'Game over' : `Round ${round}`}
        </h2>
        <span className="text-sm font-semibold text-maroon/70">{alive.length} in · {Object.keys(roster).length} joined</span>
      </div>

      {status === 'LOBBY' && (
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-lg font-semibold">
            <input type="checkbox" className="h-6 w-6" checked={session.registrationOpen}
              onChange={(e) => run(() => setRegistration(e.target.checked))()} />
            Joining is {session.registrationOpen ? 'open' : 'closed'}
          </label>
          {pending > 0 && <p className="text-sm text-maroon/70">Giving numbers to {pending} new {pending === 1 ? 'player' : 'players'}…</p>}
          {startButton}
          <p className="text-sm text-maroon/60">Starting round 1 closes joining.</p>
        </div>
      )}

      {status === 'LIVE' && (
        <div>
          <div className="flex items-center gap-6">
            <Countdown ms={Math.max(0, (session.explodesAt?.toMillis() ?? 0) - now)} className="text-6xl text-maroon" />
            {(session.explodesAt?.toMillis() ?? 0) <= now && <span className="font-semibold text-maroon/70">Setting off the bombs…</span>}
          </div>
          <p className="mt-2 text-sm text-maroon/70">Keep this tab open: it sets off the bombs when the timer runs out.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {bombs.map((b, i) => (
              <span key={i} className="rounded-full bg-red-50 px-2.5 py-1 text-sm font-semibold text-red-800">
                💣 {label(b.holder)} <span className="text-red-800/50">· {b.passes} passes</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {status === 'EXPLODED' && (
        <div className="space-y-4">
          <Eliminated session={session} />
          {startButton}
          {session.autoAdvance && <p className="text-sm text-maroon/70">Auto-advance is on: the next round starts in a few seconds.</p>}
        </div>
      )}

      {status === 'FINISHED' && (
        <div className="space-y-3">
          <Eliminated session={session} />
          <div className="rounded-xl bg-gold-light p-4 text-center">
            <div className="text-4xl">🏆</div>
            <div className="text-2xl font-black text-maroon">{session.winners.map(label).join(' & ')}</div>
          </div>
        </div>
      )}
    </section>
  )
}

function Eliminated({ session }: { session: Session }) {
  if (session.eliminatedThisRound.length === 0) return <p className="text-maroon/70">Nobody was knocked out in round {session.round}.</p>
  return (
    <div>
      <p className="mb-1.5 font-semibold">💥 Out in round {session.round}:</p>
      <div className="flex flex-wrap gap-1.5">
        {session.eliminatedThisRound.map((n) => (
          <span key={n} className="rounded-full bg-neutral-200 px-2.5 py-1 text-sm font-semibold">{playerLabel(n, session.roster)}</span>
        ))}
      </div>
    </div>
  )
}

function Settings({ session, run }: { session: Session; run: Run }) {
  const locked = session.status === 'LIVE'
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Timer</span>
        {DURATIONS.map((d) => (
          <button key={d} disabled={locked} onClick={run(() => updateSettings({ durationSec: d }))}
            className={`rounded-lg px-4 py-2 font-bold disabled:opacity-50 ${session.durationSec === d ? 'bg-maroon text-cream' : 'bg-cream text-maroon'}`}>
            {d}s
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <span className="font-semibold">1 bomb per</span>
        <input type="number" min={2} max={50} disabled={locked} value={session.bombRatio}
          onChange={(e) => {
            const v = Math.round(Number(e.target.value))
            if (v >= 2 && v <= 50) run(() => updateSettings({ bombRatio: v }))()
          }}
          className="w-16 rounded-lg border-2 border-maroon/20 px-2 py-1.5 text-center font-bold" />
        <span className="font-semibold">players</span>
      </label>
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={session.autoAdvance}
          onChange={(e) => run(() => updateSettings({ autoAdvance: e.target.checked }))()} />
        Auto-start next round after {AUTO_ADVANCE_MS / 1000}s
      </label>
    </section>
  )
}

function PlayerList({ session, holders, run }: { session: Session; holders: number[]; run: Run }) {
  const [filter, setFilter] = useState('')
  const holding = useMemo(() => new Set(holders), [holders])
  const alive = useMemo(() => new Set(session.alive), [session.alive])
  const numbers = Object.keys(session.roster).map(Number).sort((a, b) => a - b)
  const q = filter.trim().toLowerCase()
  const shown = q ? numbers.filter((n) => String(n) === q || session.roster[String(n)].toLowerCase().includes(q)) : numbers

  return (
    <section className="flex max-h-[calc(100dvh-7rem)] flex-col rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-lg font-black text-maroon">Players ({numbers.length})</h2>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search"
          className="w-32 rounded-lg border-2 border-maroon/20 px-2 py-1 text-sm" />
      </div>
      <ul className="flex-1 divide-y divide-maroon/10 overflow-y-auto">
        {shown.map((n) => {
          const out = session.outRound[String(n)]
          const isIn = alive.has(n)
          return (
            <li key={n} className={`flex items-center gap-2 py-1.5 text-sm ${isIn ? '' : 'text-neutral-400'}`}>
              <span className="w-10 font-black">#{n}</span>
              <span className={`flex-1 truncate ${isIn ? '' : 'line-through'}`}>{session.roster[String(n)]}</span>
              <span className="text-xs font-semibold">
                {holding.has(n) && isIn ? '💣' : isIn ? (session.winners.includes(n) ? '🏆' : 'In') : out === REMOVED ? 'Removed' : `Out R${out}`}
              </span>
              {isIn && session.status !== 'FINISHED' && (
                <button onClick={() => confirm(`Remove ${playerLabel(n, session.roster)} from the game?`) && run(() => removePlayer(n))()}
                  className="rounded px-1.5 text-xs text-red-700 hover:bg-red-50" title="Remove player">✕</button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
