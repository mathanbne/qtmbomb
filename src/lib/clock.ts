import { doc, getDocFromServer, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

// Phones' clocks can be seconds apart. Every countdown uses the Firestore server clock instead,
// because the server clock is also what decides whether a pass made it before zero.
let offsetMs = 0

export const serverNow = () => Date.now() + offsetMs

/** Writes a server timestamp to clock/{uid}, reads it back and keeps the sample with the shortest round trip. */
export async function syncClock(uid: string) {
  const ref = doc(db, 'clock', uid)
  let best = Infinity
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    await setDoc(ref, { t: serverTimestamp() })
    const t1 = Date.now()
    const t = (await getDocFromServer(ref)).data()?.t as Timestamp | undefined
    if (t && t1 - t0 < best) {
      best = t1 - t0
      offsetMs = t.toMillis() - (t0 + t1) / 2
    }
  }
}
