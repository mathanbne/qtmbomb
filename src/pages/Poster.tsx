import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Logo } from '../components/Brand'
import { EVENT } from '../lib/event'
import { publicUrl } from '../lib/firebase'

const STEPS = [
  'Scan the QR code with your phone camera',
  'Enter your first name and tap Join. You get a number',
  'Bomb on your phone? Tap PASS, fast!',
  'Holding it at zero? 💥 You\'re out. Last one standing wins!',
]

export default function Poster() {
  const [layout, setLayout] = useState<'a4' | 'tent'>('a4')
  const url = publicUrl.replace(/^https?:\/\//, '')

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4 ${layout === 'a4' ? 'portrait' : 'landscape'}; margin: 0; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-3 px-4">
        <button onClick={() => setLayout('a4')} className={`rounded-lg px-4 py-2 font-semibold ${layout === 'a4' ? 'bg-plum text-cream' : 'bg-white'}`}>
          A4 poster
        </button>
        <button onClick={() => setLayout('tent')} className={`rounded-lg px-4 py-2 font-semibold ${layout === 'tent' ? 'bg-plum text-cream' : 'bg-white'}`}>
          Table tent
        </button>
        <span className="text-sm text-neutral-600">Print with your browser (Ctrl/Cmd + P).</span>
      </div>

      {layout === 'a4' ? (
        <div className="relative mx-auto flex h-[297mm] w-[210mm] flex-col items-center overflow-hidden bg-plum-dark px-[18mm] pt-[14mm] text-center text-cream shadow-xl [print-color-adjust:exact] print:shadow-none">
          <p className="text-[5mm] font-semibold uppercase tracking-[0.3em] text-gold-light">{EVENT.name} · {EVENT.hosts}</p>
          <h1 className="mt-[4mm] font-serif text-[17mm] font-bold leading-none text-gold-light">💣 Pass the Bomb</h1>
          <p className="mt-[3mm] text-[6.5mm] font-semibold text-cream/85">Scan to play · last one standing wins</p>
          <div className="mt-[10mm] rounded-[6mm] border-[2mm] border-gold bg-white p-[6mm]">
            <QRCodeSVG value={publicUrl} size={512} className="h-[75mm] w-[75mm]" fgColor="#2a0636" level="M" />
          </div>
          <p className="mt-[4mm] font-mono text-[5mm] text-gold-light">{url}</p>
          <ol className="mt-[8mm] space-y-[3mm] text-left text-[5.5mm] text-cream">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-[3mm]">
                <span className="flex h-[8mm] w-[8mm] shrink-0 items-center justify-center rounded-full bg-gold text-[4.5mm] font-bold text-plum-dark">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-[8mm] text-[5mm] font-semibold text-gold-light">{EVENT.date} · {EVENT.time} · {EVENT.venue}</p>
          <p className="mt-[2mm] text-[4.5mm] text-cream/80">🔊 Turn your volume up and silent mode off</p>
          <img src="/diyas.jpg" alt="" className="absolute inset-x-0 bottom-0 h-[55mm] w-full object-cover object-top" />
        </div>
      ) : (
        // A4 landscape folded in half: the top half is printed upside down so both sides read correctly.
        <div className="mx-auto flex h-[210mm] w-[297mm] flex-col bg-cream shadow-xl print:shadow-none">
          {[true, false].map((flipped) => (
            <div key={String(flipped)} className={`flex h-1/2 items-center justify-center gap-[12mm] px-[16mm] ${flipped ? 'rotate-180' : ''} ${flipped ? '' : 'border-t border-dashed border-plum/30'}`}>
              <div className="rounded-[4mm] border-[1.5mm] border-gold bg-white p-[3mm]">
                <QRCodeSVG value={publicUrl} size={400} className="h-[62mm] w-[62mm]" fgColor="#2a0636" level="M" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-[3mm]">
                  <Logo className="h-[14mm] w-[14mm]" />
                  <span className="font-serif text-[11mm] font-bold text-plum">Pass the Bomb</span>
                </div>
                <p className="mt-[2mm] text-[5mm] font-semibold text-plum/80">{EVENT.name} · {EVENT.hosts} · scan to play</p>
                <ol className="mt-[4mm] space-y-[1.5mm] text-[4.2mm] text-plum-dark">
                  {STEPS.map((s, i) => (
                    <li key={s}>
                      <b>{i + 1}.</b> {s}
                    </li>
                  ))}
                </ol>
                <p className="mt-[3mm] font-mono text-[4mm] text-plum">{url}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
