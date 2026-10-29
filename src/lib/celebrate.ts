import confetti from 'canvas-confetti'

const COLORS = ['#d9a441', '#f6d58e', '#c0569b', '#ff8c1e', '#ffffff']

export function celebrate(big = false) {
  const burst = (x: number) =>
    confetti({ particleCount: big ? 140 : 80, spread: big ? 100 : 70, origin: { x, y: 0.6 }, colors: COLORS })
  burst(0.25)
  burst(0.75)
  if (big) setTimeout(() => burst(0.5), 350)
}
