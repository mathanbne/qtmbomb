import { useEffect, useRef, useState } from 'react'
import { ensureAnonymousUser, watchBombs, watchSession } from './api'
import { serverNow, syncClock } from './clock'
import { firebaseConfigured } from './firebase'
import type { Bomb, Session } from './types'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [error, setError] = useState<string | null>(firebaseConfigured ? null : 'Firebase is not configured')

  useEffect(() => {
    if (!firebaseConfigured) return
    return watchSession(
      (s) => {
        setSession(s)
        setLoading(false)
      },
      (e) => {
        setError(e.message)
        setLoading(false)
      },
    )
  }, [])

  return { session, loading, error }
}

/** Bombs for the round in progress (empty in the lobby). */
export function useBombs(session: Session | null) {
  const [bombs, setBombs] = useState<Bomb[]>([])
  const sessionId = session?.sessionId
  const round = session?.round ?? 0
  useEffect(() => {
    setBombs([])
    if (!sessionId || round === 0) return
    return watchBombs(sessionId, round, setBombs)
  }, [sessionId, round])
  return bombs
}

/** Signs in anonymously (unless someone is already signed in) and syncs the clock. */
export function useAnonymousUser() {
  const [uid, setUid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!firebaseConfigured) return
    let cancelled = false
    ensureAnonymousUser()
      .then((u) => {
        if (cancelled) return
        setUid(u.uid)
        // A failed sync leaves the offset at 0: countdowns then use the device clock.
        syncClock(u.uid).catch(() => {})
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])
  return { uid, error }
}

/** Re-renders every `intervalMs` and returns the server time. */
export function useServerNow(intervalMs = 200) {
  const [now, setNow] = useState(serverNow())
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Milliseconds left in the round (0 when not running). */
export function useRemaining(session: Session | null) {
  const now = useServerNow()
  if (session?.status !== 'LIVE' || !session.explodesAt) return 0
  return Math.max(0, session.explodesAt.toMillis() - now)
}

/** Keeps the screen awake while `active` (where the browser supports it). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) lock.release()
      } catch {
        // Denied (low battery, not visible); try again next time the page becomes visible.
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && acquire()
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release()
    }
  }, [active])
}

/** The previous value of `value` from the last render. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref.current
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // iOS Safari has no vibration; the red flash covers it.
  }
}

/** Seconds shown on a countdown: 30, 29 … 1, 0. */
export const secondsLeft = (ms: number) => Math.ceil(ms / 1000)
