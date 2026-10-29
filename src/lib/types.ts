import type { Timestamp } from 'firebase/firestore'

export type Status = 'LOBBY' | 'LIVE' | 'EXPLODED' | 'FINISHED'

/** session/current: the single document every screen listens to. Only the host writes it. */
export interface Session {
  sessionId: string
  status: Status
  registrationOpen: boolean
  /** 0 in the lobby, then 1, 2, 3… */
  round: number
  durationSec: number
  /** One bomb for every this many players still in. */
  bombRatio: number
  autoAdvance: boolean
  explodesAt: Timestamp | null
  bombCount: number
  nextNumber: number
  /** Player number → first name. Keys are numbers as strings (Firestore map keys). */
  roster: Record<string, string>
  /** Numbers still in the game. */
  alive: number[]
  /** Player number → round they went out in. 0 means removed by the host. */
  outRound: Record<string, number>
  eliminatedThisRound: number[]
  winners: number[]
}

/** players/{uid}: written by the player on join; the host fills in `number`. */
export interface PlayerDoc {
  sessionId: string
  name: string
  number: number | null
}

/** bombs/{sessionId}_{round}_{index} */
export interface Bomb {
  id: string
  sessionId: string
  round: number
  holder: number
  prevHolder: number | null
  passes: number
  receivedAt: Timestamp | null
}

export const DURATIONS = [15, 30] as const
export const DEFAULT_BOMB_RATIO = 8
export const REMOVED = 0
