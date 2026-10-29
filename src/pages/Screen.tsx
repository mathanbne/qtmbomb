import { QRCodeSVG } from 'qrcode.react'
import { useEffect, type ReactNode } from 'react'
import { Countdown, Logo } from '../components/Brand'
import { SoundToggle } from '../components/SoundToggle'
import { celebrate } from '../lib/celebrate'
import { publicUrl } from '../lib/firebase'
import { playerLabel } from '../lib/game'
import { useAnonymousUser, useBombs, usePrevious, useRemaining, useSession, useWakeLock } from '../lib/hooks'
import { EVENT } from '../lib/event'
import { sounds } from '../lib/sound'

/** Projector page: join QR in the lobby, then the countdown, the bombs and the blasts. */
export default function Screen() {
  useAnonymousUser() // for the clock sync
  const { session } = useSession()
  const bombs = useBombs(session)
  const remaining = useRemaining(session)
  useWakeLock(true)

  const status = session?.status
  const prevStatus = usePrevious(status)
  useEffect(() => {
    if (prevStatus === undefined || prevStatus === status) return
    if (status === 'LIVE') sounds.start()
    if (status === 'EXPLODED' || (status === 'FINISHED' && prevStatus === 'LIVE')) sounds.blast()
  }, [status, prevStatus])

  useEffect(() => {
    if (status !== 'FINISHED' || prevStatus !== 'LIVE') return
    const t = setTimeout(() => {
      sounds.fanfare()
      celebrate(true)
    }, 1500)
    return () => clearTimeout(t)
  }, [status, prevStatus])

  // Ticking on the big speakers: every second, then four times a second at the end.
  const urgent = remaining > 0 && remaining <= 5000
  const ticking = status === 'LIVE' && remaining > 0
  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => sounds.tick(urgent), urgent ? 250 : 1000)
    return () => clearInterval(t)
  }, [ticking, urgent])

  // Sounds are silent until someone clicks this once (browser rule); muting is remembered on this laptop.
  const soundButton = <SoundToggle className="fixed right-4 top-4 z-40 !px-4 !py-2 shadow-lg" />

  if (!session) {
    return (
      <Frame className="bg-plum-dark text-cream">
        {soundButton}
        <EventTitle className="mb-10" />
        <Logo className="h-32 w-32" />
        <h1 className="mt-6 font-serif text-7xl font-bold text-gold-light">Pass the Bomb</h1>
      </Frame>
    )
  }

  const label = (n: number) => playerLabel(n, session.roster)
  const joined = Object.keys(session.roster).map(Number)

  if (session.status === 'LOBBY') {
    const recent = [...joined].sort((a, b) => b - a).slice(0, 18)
    return (
      <Frame className="bg-plum-dark pb-[17vh] text-cream">
        {soundButton}
        <EventTitle className="mb-8" />
        <div className="grid w-full max-w-7xl grid-cols-[auto_1fr] items-center gap-16 px-12">
          <div className="text-center">
            <div className="rounded-3xl border-8 border-gold bg-white p-6">
              <QRCodeSVG value={publicUrl} size={360} fgColor="#2a0636" level="M" />
            </div>
            <p className="mt-4 font-mono text-2xl">{publicUrl.replace(/^https?:\/\//, '')}</p>
          </div>
          <div>
            <h1 className="whitespace-nowrap font-serif text-7xl font-bold text-gold-light">💣 Pass the Bomb</h1>
            <p className="mt-4 text-3xl text-cream/80">{session.registrationOpen ? 'Scan to join!' : 'Joining opens soon…'}</p>
            <div className="mt-6 text-[8rem] font-black leading-none text-gold-light">{joined.length}</div>
            <div className="text-3xl font-semibold">players in</div>
            <div className="mt-6 flex flex-wrap gap-2">
              {recent.map((n) => (
                <span key={n} className="animate-pop-in rounded-full bg-white/15 px-4 py-1.5 text-xl font-semibold">{label(n)}</span>
              ))}
            </div>
          </div>
        </div>
        <img src="/diyas.jpg" alt="" className="absolute inset-x-0 bottom-0 h-[15vh] w-full object-cover object-top opacity-90" />
      </Frame>
    )
  }

  if (session.status === 'LIVE') {
    const holders = bombs.map((b) => b.holder)
    return (
      <Frame className={urgent ? 'animate-danger-fast text-white' : 'bg-plum-dark text-white'}>
        {soundButton}
        <EventTitle className="mb-8" />
        <div className="text-3xl font-bold text-white/70">Round {session.round} · {session.alive.length} players in</div>
        <Countdown ms={remaining} className="my-6 text-[16rem] text-white" />
        <div className="mb-4 text-3xl font-bold">💣 {bombs.length} {bombs.length === 1 ? 'bomb' : 'bombs'} in play</div>
        <div className="flex max-w-7xl flex-wrap justify-center gap-3 px-8">
          {holders.map((h, i) => (
            <span key={i} className="animate-holder rounded-full bg-danger px-5 py-2 text-2xl font-black">💣 {label(h)}</span>
          ))}
        </div>
      </Frame>
    )
  }

  if (session.status === 'EXPLODED') {
    const out = session.eliminatedThisRound
    return (
      <Frame className="bg-plum-dark text-white">
        {soundButton}
        <div key={session.round} className="blast-flash" />
        <EventTitle className="mb-6" />
        <div key={`s${session.round}`} className="animate-shake flex flex-col items-center">
          <div className="text-[10rem] leading-none">💥</div>
          <h1 className="text-8xl font-black text-orange-400">BOOM!</h1>
        </div>
        <p className="mt-6 text-4xl font-bold">{out.length === 0 ? 'Nobody' : out.length === 1 ? '1 player' : `${out.length} players`} out in round {session.round}</p>
        <div className="mt-6 flex max-w-7xl flex-wrap justify-center gap-3 px-8">
          {out.map((n) => (
            <span key={n} className="rounded-full bg-white/15 px-5 py-2 text-2xl font-semibold line-through decoration-orange-400">{label(n)}</span>
          ))}
        </div>
        <p className="mt-10 text-5xl font-black text-safe">{session.alive.length} players left</p>
      </Frame>
    )
  }

  return (
    <Frame className="bg-plum-dark pb-[17vh] text-cream">
      {soundButton}
      <EventTitle className="mb-8" />
      <div className="text-[10rem] leading-none">🏆</div>
      <p className="mt-6 text-4xl text-cream/80">{session.winners.length > 1 ? 'Our winners are' : 'The winner is'}</p>
      <h1 className="animate-pop-in mt-4 text-center text-9xl font-black text-gold-light">{session.winners.map(label).join(' & ')}</h1>
      <p className="mt-8 text-3xl text-cream/70">Last one standing after {session.round} rounds!</p>
      <p className="mt-4 text-2xl font-semibold text-gold-light">Happy Diwali! 🪔</p>
      <img src="/diyas.jpg" alt="" className="absolute inset-x-0 bottom-0 h-[15vh] w-full object-cover object-top opacity-80" />
    </Frame>
  )
}

/** "Diwali Celebration 2026" in glowing gold, hosts underneath. */
function EventTitle({ className = '' }: { className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <h2 className="font-serif text-7xl font-bold tracking-wide">
        🪔{' '}
        <span
          className="bg-gradient-to-b from-[#fff3c4] via-gold-light to-gold bg-clip-text text-transparent"
          style={{ filter: 'drop-shadow(0 0 18px rgba(246, 213, 142, 0.55))' }}
        >
          {EVENT.title}
        </span>{' '}
        🪔
      </h2>
      <p className="mt-3 text-4xl font-semibold text-cream">{EVENT.hostsFull}</p>
    </div>
  )
}

function Frame({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`relative flex min-h-dvh flex-col items-center justify-center overflow-hidden ${className}`}>{children}</div>
}
