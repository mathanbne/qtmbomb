import { useEffect, useState } from 'react'
import { audioReady, audioState, isMuted, setMuted, sounds, unlockAudio } from '../lib/sound'

/**
 * Mute / unmute switch that always stays on screen. "On" needs both: not muted, and the browser
 * has let audio start (which only happens after a tap, and can stop again when the phone locks).
 */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [, rerender] = useState(0)
  const refresh = () => rerender((x) => x + 1)
  useEffect(() => {
    const t = setInterval(refresh, 1000)
    return () => clearInterval(t)
  }, [])

  const on = !isMuted() && audioReady()
  const toggle = () => {
    if (on) {
      setMuted(true)
      refresh()
      return
    }
    setMuted(false)
    void unlockAudio().then(() => {
      refresh()
      if (audioReady()) sounds.start() // a beep so you know it worked
    })
  }

  // Shows why it's off when the browser is holding audio back (e.g. "interrupted" on iPhones).
  const state = audioState()
  const stuck = !isMuted() && state !== 'running' && state !== 'suspended' && state !== 'none' ? ` (${state})` : ''

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${on ? 'bg-white/20 text-white' : 'bg-white text-plum'} ${className}`}
    >
      {on ? '🔊 Sound on' : `🔇 Sound off${stuck}`}
    </button>
  )
}
