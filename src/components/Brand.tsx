import type { ReactNode } from 'react'
import { EVENT } from '../lib/event'

/** Diya emblem (also the favicon and app icon). */
export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return <img src="/logo.png" alt="" className={`${className} rounded-[22%] object-contain`} />
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 bg-plum px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-cream">
      <Logo className="h-9 w-9" />
      <div className="flex-1 leading-tight">
        <div className="text-base font-extrabold tracking-wide">Pass the Bomb 💣</div>
        <div className="text-xs font-semibold text-gold-light">{EVENT.name} · {EVENT.hosts}</div>
      </div>
      {right}
    </header>
  )
}

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return <div className={`${className} animate-spin rounded-full border-[3px] border-plum/20 border-t-plum`} />
}

export function CenteredMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h2 className="text-xl font-bold text-plum">{title}</h2>
      {children && <div className="text-plum/70">{children}</div>}
    </div>
  )
}

/** Big round-clock number. Turns red in the last 5 seconds. */
export function Countdown({ ms, className = 'text-7xl' }: { ms: number; className?: string }) {
  const s = Math.ceil(ms / 1000)
  return (
    <div className={`${className} font-black tabular-nums leading-none ${s <= 5 ? 'text-danger' : ''}`}>
      0:{String(s).padStart(2, '0')}
    </div>
  )
}
