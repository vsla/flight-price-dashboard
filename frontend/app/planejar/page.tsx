'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { usePersistedFilters } from '@/lib/hooks'

const DEST_INFO: Record<string, { name: string; subtitle: string; gradient: string; minPrice: string }> = {
  MAD: { name: 'Madrid',  subtitle: 'Espanha',  gradient: 'from-violet-500 to-indigo-500', minPrice: 'R$1.803' },
  LIS: { name: 'Lisboa',  subtitle: 'Portugal', gradient: 'from-emerald-400 to-teal-600',  minPrice: 'R$1.850' },
  OPO: { name: 'Porto',   subtitle: 'Portugal', gradient: 'from-orange-400 to-red-500',    minPrice: 'R$1.920' },
}

const DURATION_PRESETS = [
  { label: '1–2 semanas', min: 7,  max: 14 },
  { label: '2–4 semanas', min: 14, max: 30 },
  { label: '1–2 meses',   min: 30, max: 60 },
]

export default function PlanejarPage() {
  const router = useRouter()
  const { setFilters } = usePersistedFilters()

  const [selectedDests, setSelectedDests] = useState<string[]>(['MAD'])
  const [minDays, setMinDays] = useState(14)
  const [maxDays, setMaxDays] = useState(30)
  const [activePreset, setActivePreset] = useState(1)

  function toggleDest(d: string) {
    setSelectedDests((prev) =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter((x) => x !== d) : prev) : [...prev, d],
    )
  }

  function applyPreset(idx: number) {
    setActivePreset(idx)
    setMinDays(DURATION_PRESETS[idx].min)
    setMaxDays(DURATION_PRESETS[idx].max)
  }

  function handleSearch() {
    setFilters({
      destinations: selectedDests,
      minStayDays: minDays,
      maxStayDays: maxDays,
      selectedMonths: [],
    })
    router.push('/')
  }

  const destSummary = selectedDests
    .map((d) => DEST_INFO[d]?.name ?? d)
    .join(', ')

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <NavBar />

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-blue-700 text-white px-6 py-8">
        <h1 className="text-2xl font-extrabold mb-1">Planejar viagem</h1>
        <p className="text-sm text-white/80">
          Escolha o destino e a duração ideal — vamos encontrar as melhores datas para você.
        </p>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-6">

        {/* Step 1: Destination */}
        <section>
          <h2 className="font-bold text-base mb-1">Onde você quer ir?</h2>
          <p className="text-xs text-muted-foreground mb-3">Selecione um ou mais destinos</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(DEST_INFO).map(([code, info]) => {
              const active = selectedDests.includes(code)
              return (
                <button
                  key={code}
                  onClick={() => toggleDest(code)}
                  className={`rounded-xl overflow-hidden border-2 text-left transition-all hover:-translate-y-0.5 ${
                    active ? 'border-primary shadow-md shadow-primary/20' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className={`h-20 bg-gradient-to-br ${info.gradient} relative flex items-end p-3`}>
                    {active && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <span className="text-primary text-xs font-black">✓</span>
                      </div>
                    )}
                    <span className="font-extrabold text-white text-lg drop-shadow">{info.name}</span>
                  </div>
                  <div className="bg-white px-3 py-2">
                    <div className="text-xs font-semibold text-foreground">{code} · {info.subtitle}</div>
                    <div className="text-[11px] text-muted-foreground">
                      desde <span className="font-bold text-primary">{info.minPrice}</span> ida
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Step 2: Duration */}
        <section className="bg-white rounded-xl border border-border p-4">
          <h2 className="font-bold text-base mb-3">Quanto tempo você quer ficar?</h2>

          <div className="flex gap-2 flex-wrap mb-4">
            {DURATION_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => applyPreset(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  activePreset === i
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-white text-foreground border-border hover:border-primary/50'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setActivePreset(-1)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                activePreset === -1
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white text-foreground border-border hover:border-primary/50'
              }`}
            >
              Personalizado
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground w-6">Mín</span>
            <input
              type="range" min={3} max={60} value={minDays}
              onChange={(e) => { setMinDays(Number(e.target.value)); setActivePreset(-1) }}
              className="flex-1 accent-primary"
            />
            <span className="text-xs font-bold text-primary w-8 text-right">{minDays}d</span>
            <span className="text-xs font-semibold text-muted-foreground w-6">Máx</span>
            <input
              type="range" min={3} max={90} value={maxDays}
              onChange={(e) => { setMaxDays(Number(e.target.value)); setActivePreset(-1) }}
              className="flex-1 accent-primary"
            />
            <span className="text-xs font-bold text-primary w-8 text-right">{maxDays}d</span>
          </div>
        </section>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSearch}
            className="bg-primary text-primary-foreground font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Ver melhores datas →
          </button>
          <span className="text-xs text-muted-foreground">
            {destSummary} · {minDays}–{maxDays} dias · todos os meses
          </span>
        </div>

      </div>
    </div>
  )
}
