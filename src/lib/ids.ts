const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Alphanumeric only: session ids are joined with "_" to build bomb document ids. */
export function newId(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
}
