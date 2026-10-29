import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId)

export const app = initializeApp(firebaseConfigured ? config : { apiKey: 'missing', projectId: 'missing', appId: 'missing' })
export const auth = getAuth(app)

// Memory cache only: a round lasts seconds, so a stale offline copy of the bombs would do more harm than good.
export const db = getFirestore(app)

export const publicUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin
