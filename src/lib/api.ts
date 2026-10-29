import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { signInAnonymously, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { serverNow } from './clock'
import { auth, db } from './firebase'
import { bombCount, pickPassTarget, placeBombs, resolveExplosion } from './game'
import { newId } from './ids'
import { DEFAULT_BOMB_RATIO, REMOVED, type Bomb, type PlayerDoc, type Session } from './types'

const sessionRef = doc(db, 'session', 'current')

/** Extra time on top of the countdown so the bombs reach every phone before the clock starts to matter. */
const DELIVERY_MS = 1000

export const bombId = (sessionId: string, round: number, index: number) => `${sessionId}_${round}_${index}`

export function watchSession(cb: (session: Session | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(sessionRef, (snap) => cb(snap.exists() ? (snap.data() as Session) : null), onError)
}

export function watchBombs(sessionId: string, round: number, cb: (bombs: Bomb[]) => void): Unsubscribe {
  const q = query(collection(db, 'bombs'), where('sessionId', '==', sessionId), where('round', '==', round))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Bomb)))
}

// ---------------------------------------------------------------- players

export async function ensureAnonymousUser(): Promise<User> {
  await auth.authStateReady()
  return auth.currentUser ?? (await signInAnonymously(auth)).user
}

export function watchMe(uid: string, cb: (p: PlayerDoc | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'players', uid), (snap) => cb(snap.exists() ? (snap.data() as PlayerDoc) : null), onError)
}

export async function joinSession(sessionId: string, uid: string, name: string) {
  await setDoc(doc(db, 'players', uid), { sessionId, name, number: null, joinedAt: serverTimestamp() })
}

/**
 * Passes one of my bombs to a random player. Runs as a transaction so two quick taps can't both pass it;
 * the rules reject it if it isn't mine any more or the countdown has already hit zero.
 * Returns the number it went to.
 */
export async function passBomb(bomb: Bomb, me: number, alive: number[], holders: number[]): Promise<number> {
  const ref = doc(db, 'bombs', bomb.id)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const current = snap.data() as Omit<Bomb, 'id'> | undefined
    if (!current || current.holder !== me) throw new Error('You no longer have this bomb')
    const target = pickPassTarget(alive, holders, me, current.prevHolder)
    if (target === null) throw new Error('Nobody left to pass to')
    tx.update(ref, { holder: target, prevHolder: me, passes: current.passes + 1, receivedAt: serverTimestamp() })
    return target
  })
}

// ---------------------------------------------------------------- host

export async function signInHost(email: string, password: string) {
  return (await signInWithEmailAndPassword(auth, email, password)).user
}

export const signOutHost = () => signOut(auth)

export async function isHost(uid: string) {
  return (await getDoc(doc(db, 'hosts', uid))).exists()
}

/** Starts a brand-new game. Old players and bombs stay in the database but are no longer used. */
export async function resetSession(previous?: Session | null) {
  const session: Session = {
    sessionId: newId(10),
    status: 'LOBBY',
    registrationOpen: false,
    round: 0,
    durationSec: previous?.durationSec ?? 30,
    bombRatio: previous?.bombRatio ?? DEFAULT_BOMB_RATIO,
    autoAdvance: previous?.autoAdvance ?? false,
    explodesAt: null,
    bombCount: 0,
    nextNumber: 1,
    roster: {},
    alive: [],
    outRound: {},
    eliminatedThisRound: [],
    winners: [],
  }
  await setDoc(sessionRef, session)
}

export const setRegistration = (open: boolean) => updateDoc(sessionRef, { registrationOpen: open })

export const updateSettings = (s: Partial<Pick<Session, 'durationSec' | 'bombRatio' | 'autoAdvance'>>) => updateDoc(sessionRef, s)

/** Players who have joined but haven't been given a number yet. */
export function watchPendingPlayers(sessionId: string, cb: (uids: string[]) => void): Unsubscribe {
  const q = query(collection(db, 'players'), where('sessionId', '==', sessionId), where('number', '==', null))
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, joinedAt: (d.data().joinedAt as Timestamp | null)?.toMillis() ?? Infinity }))
    cb(docs.sort((a, b) => a.joinedAt - b.joinedAt).map((d) => d.id))
  })
}

/** Gives numbers in join order. One transaction, so a second admin tab can't hand out the same number twice. */
export async function assignNumbers(uids: string[]) {
  const batch = uids.slice(0, 200)
  await runTransaction(db, async (tx) => {
    const s = (await tx.get(sessionRef)).data() as Session
    const players = await Promise.all(batch.map((uid) => tx.get(doc(db, 'players', uid))))
    let next = s.nextNumber
    const roster = { ...s.roster }
    const added: number[] = []
    for (const p of players) {
      const data = p.data() as PlayerDoc | undefined
      if (!data || data.sessionId !== s.sessionId || data.number !== null) continue
      const n = next++
      tx.update(p.ref, { number: n })
      roster[String(n)] = data.name
      added.push(n)
    }
    if (added.length > 0) tx.update(sessionRef, { nextNumber: next, roster, alive: [...s.alive, ...added] })
  })
}

export async function startRound() {
  await runTransaction(db, async (tx) => {
    const s = (await tx.get(sessionRef)).data() as Session
    if (s.status !== 'LOBBY' && s.status !== 'EXPLODED') throw new Error('A round is already running')
    const n = bombCount(s.alive.length, s.bombRatio)
    if (n === 0) throw new Error('Need at least 2 players')
    const round = s.round + 1
    placeBombs(s.alive, n).forEach((holder, i) => {
      tx.set(doc(db, 'bombs', bombId(s.sessionId, round, i)), {
        sessionId: s.sessionId,
        round,
        holder,
        prevHolder: null,
        passes: 0,
        receivedAt: serverTimestamp(),
      })
    })
    tx.update(sessionRef, {
      status: 'LIVE',
      round,
      bombCount: n,
      registrationOpen: false,
      eliminatedThisRound: [],
      explodesAt: Timestamp.fromMillis(serverNow() + s.durationSec * 1000 + DELIVERY_MS),
    })
  })
}

/** Called by the host page once the countdown is over: whoever holds a bomb now is out. */
export async function explodeRound() {
  await runTransaction(db, async (tx) => {
    const s = (await tx.get(sessionRef)).data() as Session
    if (s.status !== 'LIVE') return
    const bombs = await Promise.all(
      Array.from({ length: s.bombCount }, (_, i) => tx.get(doc(db, 'bombs', bombId(s.sessionId, s.round, i)))),
    )
    const holders = bombs.map((b) => b.data()?.holder as number)
    const result = resolveExplosion(s.alive, holders)
    const outRound = { ...s.outRound }
    for (const n of result.out) outRound[String(n)] = s.round
    tx.update(sessionRef, {
      status: result.finished ? 'FINISHED' : 'EXPLODED',
      alive: result.alive,
      eliminatedThisRound: result.out,
      winners: result.winners,
      outRound,
    })
  })
}

/** Takes a player out of the game (duplicate, prank name, left early). */
export async function removePlayer(n: number) {
  await runTransaction(db, async (tx) => {
    const s = (await tx.get(sessionRef)).data() as Session
    const alive = s.alive.filter((a) => a !== n)
    const update: Partial<Session> = { alive, outRound: { ...s.outRound, [String(n)]: REMOVED } }
    // Removing the second-to-last player between rounds ends the game.
    if (alive.length === 1 && s.status === 'EXPLODED') Object.assign(update, { status: 'FINISHED', winners: alive })
    tx.update(sessionRef, update)
  })
}

/** Dev only: adds pretend players (no phones) to test the projector and board with a full room. */
export async function seedFakePlayers(count: number) {
  await runTransaction(db, async (tx) => {
    const s = (await tx.get(sessionRef)).data() as Session
    const names = ['Priya', 'Arun', 'Kavya', 'Vijay', 'Meena', 'Karthik', 'Divya', 'Suresh', 'Lakshmi', 'Ravi', 'Anitha', 'Bala']
    const roster = { ...s.roster }
    const added: number[] = []
    for (let i = 0; i < count; i++) {
      const n = s.nextNumber + i
      roster[String(n)] = names[n % names.length]
      added.push(n)
    }
    tx.update(sessionRef, { roster, alive: [...s.alive, ...added], nextNumber: s.nextNumber + count })
  })
}
