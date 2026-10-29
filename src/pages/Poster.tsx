import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Logo } from '../components/Brand'
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
        <button onClick={() => setLayout('a4')} className={`rounded-lg px-4 py-2 font-semibold ${layout === 'a4' ? 'bg-maroon text-cream' : 'bg-white'}`}>
          A4 poster
        </button>
        <button onClick={() => setLayout('tent')} className={`rounded-lg px-4 py-2 font-semibold ${layout === 'tent' ? 'bg-maroon text-cream' : 'bg-white'}`}>
          Table tent
        </button>
        <span className="text-sm text-neutral-600">Print with your browser (Ctrl/Cmd + P).</span>
      </div>

      {layout === 'a4' ? (
        <div className="mx-auto flex h-[297mm] w-[210mm] flex-col items-center bg-cream px-[18mm] py-[16mm] text-center shadow-xl print:shadow-none">
          <Logo className="h-[30mm] w-[30mm]" />
          <h1 className="mt-[6mm] text-[16mm] font-black leading-none text-maroon">💣 PASS THE BOMB</h1>
          <p className="mt-[3mm] text-[7mm] font-semibold text-maroon/80">Scan to play · last one standing wins</p>
          <div className="mt-[10mm] rounded-[6mm] border-[2mm] border-gold bg-white p-[6mm]">
            <QRCodeSVG value={publicUrl} size={512} className="h-[75mm] w-[75mm]" fgColor="#5c0017" level="M" />
          </div>
          <p className="mt-[4mm] font-mono text-[5mm] text-maroon">{url}</p>
          <ol className="mt-[10mm] space-y-[3mm] text-left text-[5.5mm] text-maroon-dark">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-[3mm]">
                <span className="flex h-[8mm] w-[8mm] shrink-0 items-center justify-center rounded-full bg-maroon text-[4.5mm] font-bold text-cream">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-auto text-[5mm] font-semibold text-maroon/80">🔊 Turn your volume up and silent mode off</p>
        </div>
      ) : (
        // A4 landscape folded in half: the top half is printed upside down so both sides read correctly.
        <div className="mx-auto flex h-[210mm] w-[297mm] flex-col bg-cream shadow-xl print:shadow-none">
          {[true, false].map((flipped) => (
            <div key={String(flipped)} className={`flex h-1/2 items-center justify-center gap-[12mm] px-[16mm] ${flipped ? 'rotate-180' : ''} ${flipped ? '' : 'border-t border-dashed border-maroon/30'}`}>
              <div className="rounded-[4mm] border-[1.5mm] border-gold bg-white p-[3mm]">
                <QRCodeSVG value={publicUrl} size={400} className="h-[62mm] w-[62mm]" fgColor="#5c0017" level="M" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-[3mm]">
                  <Logo className="h-[14mm] w-[14mm]" />
                  <span className="text-[11mm] font-black text-maroon">PASS THE BOMB</span>
                </div>
                <p className="mt-[2mm] text-[6mm] font-semibold text-maroon/80">Scan to play on your phone</p>
                <ol className="mt-[4mm] space-y-[1.5mm] text-[4.2mm] text-maroon-dark">
                  {STEPS.map((s, i) => (
                    <li key={s}>
                      <b>{i + 1}.</b> {s}
                    </li>
                  ))}
                </ol>
                <p className="mt-[3mm] font-mono text-[4mm] text-maroon">{url}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
