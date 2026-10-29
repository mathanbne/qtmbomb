// Dev tool: pretend players that join and pass the bomb like real phones (1–4.5s after it lands on them).
// Usage: npm run bots -- 3      (needs .env.local, and the /admin tab open so they get numbers)
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { collection, doc, getFirestore, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

const NAMES = ['Robo', 'Bolt', 'Chip', 'Sparky', 'Gizmo', 'Widget', 'Pixel', 'Turbo', 'Echo', 'Nova']
const count = Math.min(NAMES.length, Number(process.argv[2] ?? 3))
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a)

// Same rule as pickPassTarget in src/lib/game.ts.
function pickTarget(alive, holders, self, prev) {
  const busy = new Set(holders)
  const others = alive.filter((n) => n !== self)
  const tiers = [others.filter((n) => !busy.has(n) && n !== prev), others.filter((n) => !busy.has(n)), others]
  for (const t of tiers) if (t.length > 0) return t[Math.floor(Math.random() * t.length)]
  return null
}

async function startBot(name, i) {
  const app = initializeApp(config, `bot${i}`)
  const db = getFirestore(app)
  const uid = (await signInAnonymously(getAuth(app))).user.uid
  let session = null
  let me
  let meLoaded = false
  let joining = false
  let bombs = []
  let bombsKey = ''
  let unsubBombs = null
  const scheduled = new Set()

  const maybeJoin = () => {
    if (!session || !meLoaded || joining || !session.registrationOpen) return
    if (me && me.sessionId === session.sessionId) return
    joining = true
    setDoc(doc(db, 'players', uid), { sessionId: session.sessionId, name, number: null, joinedAt: serverTimestamp() })
      .then(() => log(`${name} joined`))
      .catch((e) => log(`${name} couldn't join: ${e.code}`))
      .finally(() => (joining = false))
  }

  const pass = async (bomb) => {
    try {
      const target = await runTransaction(db, async (tx) => {
        const ref = doc(db, 'bombs', bomb.id)
        const cur = (await tx.get(ref)).data()
        if (!cur || cur.holder !== me?.number) return null
        const t = pickTarget(session.alive, bombs.map((b) => b.holder), me.number, cur.prevHolder)
        if (t === null) return null
        tx.update(ref, { holder: t, prevHolder: me.number, passes: cur.passes + 1, receivedAt: serverTimestamp() })
        return t
      })
      if (target !== null) log(`${name} (#${me.number}) passed to #${target}`)
    } catch (e) {
      log(`${name} (#${me?.number}) pass failed: ${e.code ?? e.message}`)
    }
  }

  const onBombs = () => {
    if (session?.status !== 'LIVE' || me?.number == null || !session.alive.includes(me.number)) return
    for (const b of bombs) {
      const key = `${b.id}:${b.passes}`
      if (b.holder !== me.number || scheduled.has(key)) continue
      scheduled.add(key)
      const delay = 1000 + Math.random() * 3500
      log(`${name} (#${me.number}) 💣 got a bomb, passing in ${(delay / 1000).toFixed(1)}s`)
      setTimeout(() => pass(b), delay)
    }
  }

  onSnapshot(doc(db, 'players', uid), (s) => {
    me = s.data() ?? null
    meLoaded = true
    maybeJoin()
    onBombs()
  })
  onSnapshot(doc(db, 'session', 'current'), (s) => {
    const prev = session
    session = s.data() ?? null
    if (!session) return
    maybeJoin()
    if (me?.number != null && prev?.status === 'LIVE' && session.status !== 'LIVE' && session.eliminatedThisRound.includes(me.number)) {
      log(`${name} (#${me.number}) 💥 is out`)
    }
    if (session.status === 'FINISHED' && prev?.status !== 'FINISHED' && session.winners.includes(me?.number)) log(`${name} 🏆 wins!`)
    const key = `${session.sessionId}_${session.round}`
    if (key !== bombsKey) {
      unsubBombs?.()
      bombsKey = key
      bombs = []
      if (session.round > 0) {
        const q = query(collection(db, 'bombs'), where('sessionId', '==', session.sessionId), where('round', '==', session.round))
        unsubBombs = onSnapshot(q, (snap) => {
          bombs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          onBombs()
        })
      }
    }
    onBombs()
  })
}

log(`Starting ${count} bots. Press Ctrl+C to stop.`)
await Promise.all(NAMES.slice(0, count).map(startBot))
