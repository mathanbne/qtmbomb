import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CenteredMessage, Countdown, Header, Spinner } from '../components/Brand'
import { joinSession, passBomb, watchMe } from '../lib/api'
import { celebrate } from '../lib/celebrate'
import { firebaseConfigured } from '../lib/firebase'
import { playerLabel } from '../lib/game'
import { useAnonymousUser, useBombs, useOnline, usePrevious, useRemaining, useSession, useWakeLock, vibrate } from '../lib/hooks'
import { audioReady, sounds, unlockAudio } from '../lib/sound'
import { REMOVED, type PlayerDoc, type Session } from '../lib/types'

/** How long you must hold a bomb before PASS works, so you hear the alarm and it can't bounce straight back. */
const MIN_HOLD_MS = 1000

export default function Player() {
  const { session, loading, error } = useSession()
  const { uid, error: authError } = useAnonymousUser()
  const [me, setMe] = useState<PlayerDoc | null | undefined>(undefined)
  const online = useOnline()

  useEffect(() => {
    if (!uid) return
    return watchMe(uid, setMe, () => setMe(null))
  }, [uid])

  const joined = !!me && !!session && me.sessionId === session.sessionId
  useWakeLock(joined)

  let body: ReactNode
  if (!firebaseConfigured) body = <CenteredMessage title="Not set up yet">Firebase settings are missing.</CenteredMessage>
  else if (error || authError) body = <CenteredMessage title="Can't connect">{error ?? authError}</CenteredMessage>
  else if (loading || !uid || me === undefined) body = <div className="flex flex-1 items-center justify-center"><Spinner className="h-10 w-10" /></div>
  else if (!session) body = <CenteredMessage title="No game yet">The host hasn't set up a game. Hang tight!</CenteredMessage>
  else if (!joined) {
    body = session.registrationOpen ? (
      <JoinForm sessionId={session.sessionId} uid={uid} />
    ) : (
      <CenteredMessage title={session.round > 0 ? 'Game in progress' : 'Joining opens soon'}>
        {session.round > 0 ? (
          <>
            New players can't join once the bombs are out.
            <br />
            <Link to="/board" className="mt-3 inline-block font-bold text-maroon underline">👀 Watch the board</Link>
          </>
        ) : (
          'Keep this page open. It will let you join as soon as the host opens the game.'
        )}
      </CenteredMessage>
    )
  } else if (me.number === null) {
    body = (
      <CenteredMessage title={`Hi ${me.name}!`}>
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8" />
          Getting your number…
        </div>
      </CenteredMessage>
    )
  } else if (session.outRound[String(me.number)] === REMOVED && !session.alive.includes(me.number)) {
    body = <CenteredMessage title="You've been removed">The host took you out of this game. Ask them if that's a mistake.</CenteredMessage>
  } else {
    return <Game session={session} number={me.number} name={me.name} online={online} />
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      {!online && <OfflineBar />}
      {body}
    </div>
  )
}

function OfflineBar() {
  return <div className="bg-amber-500 px-4 py-1.5 text-center text-sm font-semibold text-white">No connection. Reconnecting…</div>
}

function JoinForm({ sessionId, uid }: { sessionId: string; uid: string }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean) return
    unlockAudio() // must happen inside the tap
    setBusy(true)
    setError(null)
    try {
      await joinSession(sessionId, uid, clean)
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : '')
      setError(`Couldn't join. Joining may have just closed. Try again. (${code})`)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-10">
      <div className="text-center text-7xl">💣</div>
      <h1 className="text-center text-3xl font-black text-maroon">Pass the Bomb</h1>
      <p className="text-center text-maroon/70">If the bomb lands on you, pass it on fast. If you're holding it when the timer hits zero, you're out!</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        placeholder="Your first name"
        autoComplete="given-name"
        className="rounded-xl border-2 border-maroon/20 bg-white px-4 py-3 text-center text-xl font-semibold outline-none focus:border-maroon"
      />
      {error && <p className="text-center text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={busy || !name.trim()} className="rounded-xl bg-maroon py-4 text-xl font-black text-cream disabled:opacity-50">
        {busy ? 'Joining…' : 'Join'}
      </button>
      <p className="text-center text-sm text-maroon/60">🔊 Turn your volume up and silent mode off.</p>
    </form>
  )
}

/** Shows a "tap for sound" button when the browser has suspended audio (e.g. after a reload). */
function useSoundOn() {
  const [on, setOn] = useState(audioReady())
  useEffect(() => {
    const t = setInterval(() => setOn(audioReady()), 1000)
    return () => clearInterval(t)
  }, [])
  const enable = () => {
    unlockAudio()
    setTimeout(() => setOn(audioReady()), 200)
  }
  return { on, enable }
}

function Game({ session, number, name, online }: { session: Session; number: number; name: string; online: boolean }) {
  const bombs = useBombs(session)
  const remaining = useRemaining(session)
  const sound = useSoundOn()
  const [passing, setPassing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const arrivals = useRef(new Map<string, number>())

  const { status, round, roster } = session
  const alive = session.alive.includes(number)
  const live = status === 'LIVE'
  const myBombs = live ? bombs.filter((b) => b.holder === number) : []
  const holding = alive && myBombs.length > 0
  const outThisRound = session.eliminatedThisRound.includes(number) && status !== 'LIVE'
  const won = status === 'FINISHED' && session.winners.includes(number)
  const label = (n: number) => playerLabel(n, roster)

  // A bomb arrived: note when (for the 1-second hold) and sound the alarm.
  const myBombKey = myBombs.map((b) => `${b.id}:${b.passes}`).join(',')
  useEffect(() => {
    let fresh = false
    const keys = new Set(myBombKey ? myBombKey.split(',') : [])
    for (const k of keys) {
      if (!arrivals.current.has(k)) {
        arrivals.current.set(k, Date.now())
        fresh = true
      }
    }
    for (const k of arrivals.current.keys()) if (!keys.has(k)) arrivals.current.delete(k)
    if (fresh) {
      sounds.alarm()
      vibrate([200, 100, 200, 100, 400])
    }
  }, [myBombKey])

  // Ticking while you hold it, faster in the last 5 seconds.
  const urgent = remaining > 0 && remaining <= 5000
  const timeUp = remaining === 0
  useEffect(() => {
    if (!holding || timeUp) return
    const t = setInterval(() => sounds.tick(urgent), urgent ? 250 : 1000)
    return () => clearInterval(t)
  }, [holding, urgent, timeUp])

  const prevStatus = usePrevious(status)
  useEffect(() => {
    if (prevStatus === undefined || prevStatus === status) return
    if (status === 'LIVE') sounds.start()
    if ((status === 'EXPLODED' || status === 'FINISHED') && outThisRound) {
      sounds.blast()
      vibrate([800, 100, 400])
    }
    if (status === 'FINISHED' && won) {
      sounds.fanfare()
      celebrate(true)
    }
  }, [status, prevStatus, outThisRound, won])

  const showToast = (text: string) => {
    setToast(text)
    setTimeout(() => setToast((t) => (t === text ? null : t)), 1800)
  }

  const passable = myBombs.find((b) => Date.now() - (arrivals.current.get(`${b.id}:${b.passes}`) ?? Date.now()) >= MIN_HOLD_MS)
  const canPass = holding && remaining > 0 && !!passable && !passing

  const pass = async () => {
    if (!passable) return
    setPassing(true)
    try {
      const target = await passBomb(passable, number, session.alive, bombs.map((b) => b.holder))
      sounds.whoosh()
      vibrate(60)
      showToast(`Passed to ${label(target)}!`)
    } catch {
      showToast(remaining === 0 ? "Too late! Time's up." : "Didn't go through. Try again!")
    } finally {
      setPassing(false)
    }
  }

  const playersLeft = session.alive.length
  const bombsInPlay = live ? session.bombCount : 0

  let bg = 'bg-cream text-maroon-dark'
  let content: ReactNode
  if (won) {
    bg = 'bg-gold text-maroon-dark'
    content = (
      <Center>
        <div className="text-8xl">🏆</div>
        <h1 className="text-5xl font-black">You win!</h1>
        <p className="text-xl font-semibold">{session.winners.length > 1 ? `Shared with ${session.winners.filter((w) => w !== number).map(label).join(', ')}` : 'Last one standing!'}</p>
        <p className="text-lg">Show this screen to the host.</p>
      </Center>
    )
  } else if (status === 'FINISHED') {
    bg = 'bg-maroon text-cream'
    content = (
      <Center>
        <div className="text-6xl">🏆</div>
        <p className="text-lg">The winner is</p>
        <h1 className="text-4xl font-black text-gold-light">{session.winners.map(label).join(' & ')}</h1>
        <p className="mt-4 text-cream/80">{alive ? 'Thanks for playing!' : `You went out in round ${session.outRound[String(number)]}. Thanks for playing!`}</p>
      </Center>
    )
  } else if (outThisRound) {
    bg = 'bg-neutral-900 text-white'
    content = (
      <Center>
        <div className="blast-flash" />
        <div className="text-9xl">💥</div>
        <h1 className="text-5xl font-black text-orange-400">BOOM!</h1>
        <p className="text-2xl font-bold">You're out</p>
        <p className="text-white/70">You made it to round {round}.</p>
        <WatchBoard dark />
      </Center>
    )
  } else if (!alive) {
    bg = 'bg-neutral-200 text-neutral-700'
    content = (
      <Center>
        <div className="text-6xl grayscale">💣</div>
        <h1 className="text-3xl font-black">You're out</h1>
        <p>Knocked out in round {session.outRound[String(number)]}.</p>
        <RoundInfo session={session} remaining={remaining} playersLeft={playersLeft} />
        <WatchBoard />
      </Center>
    )
  } else if (holding) {
    bg = `${urgent ? 'animate-danger-fast' : 'animate-danger'} text-white`
    content = (
      <Center>
        <div className="animate-wobble text-[9rem] leading-none">💣</div>
        <h1 className="text-3xl font-black uppercase">You've got the bomb!</h1>
        {myBombs.length > 1 && <p className="font-bold">You're holding {myBombs.length} bombs!</p>}
        <Countdown ms={remaining} className="text-6xl text-white" />
        {remaining > 0 ? (
          <button
            onClick={pass}
            disabled={!canPass}
            className="mt-2 w-full max-w-xs rounded-3xl bg-white py-8 text-5xl font-black text-red-700 shadow-2xl active:scale-95 disabled:opacity-60"
          >
            {passing ? '…' : canPass ? 'PASS!' : 'Wait…'}
          </button>
        ) : (
          <p className="text-2xl font-black">⏱ Time's up…</p>
        )}
      </Center>
    )
  } else if (live) {
    bg = 'bg-safe text-white'
    content = (
      <Center>
        <div className="text-7xl">😅</div>
        <h1 className="text-3xl font-black">You're safe… for now</h1>
        <Countdown ms={remaining} className="text-7xl text-white" />
        <p className="text-lg font-semibold">💣 {bombsInPlay} {bombsInPlay === 1 ? 'bomb' : 'bombs'} in play · {playersLeft} players in</p>
      </Center>
    )
  } else if (status === 'EXPLODED') {
    bg = 'bg-safe text-white'
    content = (
      <Center>
        <div className="text-7xl">😮‍💨</div>
        <h1 className="text-3xl font-black">You survived round {round}!</h1>
        <p className="text-lg">{session.eliminatedThisRound.length} out · {playersLeft} players left</p>
        <p className="text-white/80">Next round starting soon. Stay ready!</p>
      </Center>
    )
  } else {
    content = (
      <Center>
        <p className="text-lg font-semibold">You're in, {name}!</p>
        <div className="animate-pop-in text-[7rem] font-black leading-none text-maroon">#{number}</div>
        <p className="text-maroon/70">Waiting for the host to start…</p>
        <p className="text-sm text-maroon/60">{playersLeft} players joined</p>
        <ul className="mt-4 space-y-1 text-left text-sm text-maroon/80">
          <li>💣 Bombs land on random players.</li>
          <li>👆 Got one? Tap <b>PASS</b> to throw it to someone else.</li>
          <li>💥 Holding a bomb when the timer hits zero? You're out.</li>
          <li>🏆 Last player standing wins!</li>
        </ul>
      </Center>
    )
  }

  return (
    <div className={`flex min-h-dvh flex-col transition-colors ${bg}`}>
      <header className="flex items-center gap-2 bg-black/20 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-semibold text-white">
        <span className="rounded-full bg-white/90 px-2.5 py-0.5 font-black text-maroon">#{number}</span>
        <span className="flex-1 truncate">{name}</span>
        {round > 0 && <span>Round {round}</span>}
        {!sound.on && (
          <button onClick={sound.enable} className="rounded-full bg-white px-3 py-1 font-bold text-maroon">🔇 Tap for sound</button>
        )}
      </header>
      {!online && <OfflineBar />}
      {content}
      {toast && (
        <div className="animate-pop-in fixed inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] rounded-2xl bg-black/85 px-4 py-3 text-center text-lg font-bold text-white">
          {toast}
        </div>
      )}
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">{children}</main>
}

function RoundInfo({ session, remaining, playersLeft }: { session: Session; remaining: number; playersLeft: number }) {
  return (
    <div className="mt-2 rounded-2xl bg-white/70 px-5 py-3">
      {session.status === 'LIVE' ? (
        <>
          <div className="text-sm">Round {session.round}</div>
          <Countdown ms={remaining} className="text-4xl" />
        </>
      ) : (
        <div className="text-sm">Between rounds</div>
      )}
      <div className="mt-1 text-sm font-semibold">{playersLeft} players still in</div>
    </div>
  )
}

function WatchBoard({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/board" className={`mt-4 rounded-full px-6 py-3 font-bold ${dark ? 'bg-white text-neutral-900' : 'bg-maroon text-cream'}`}>
      👀 Watch the board
    </Link>
  )
}
