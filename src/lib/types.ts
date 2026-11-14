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
  /** Player number, or RETIRED (-1) once the bomb is out of play. */
  holder: number
  prevHolder: number | null
  passes: number
  receivedAt: Timestamp | null
}

export const DURATIONS = [15, 30] as const
export const DEFAULT_BOMB_RATIO = 8
/** Most players one game takes. Joining closes by itself once this many have numbers (firestore.rules: 200). */
export const MAX_PLAYERS = 200
/** True once every player number has been handed out. */
export const isFull = (s: Pick<Session, 'nextNumber'>) => s.nextNumber > MAX_PLAYERS
export const REMOVED = 0
/** A player can hold a bomb for this long. After that it blows up on them. */
export const FUSE_MS = 3000
/**
 * Network allowance on top of the fuse: a PASS tapped just before the phone shows 0 still counts if it reaches
 * the server within this. The host sets the bomb off only after it (firestore.rules uses the same 3300ms).
 */
export const FUSE_SLACK_MS = 300
/** `holder` of a bomb that blew up when every remaining player already had one: it's out of play. */
export const RETIRED = -1
