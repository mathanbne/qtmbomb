import { results } from './game'
import type { Session } from './types'

export function resultsCsv(session: Session): string {
  const rows = [['Place', 'Number', 'Name', 'Result']]
  for (const r of results(session)) rows.push([r.place === null ? '' : String(r.place), String(r.number), r.name, r.result])
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
