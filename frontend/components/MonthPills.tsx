'use client'

import { cn } from '@/lib/utils'

interface MonthPillsProps {
  availableMonths: string[]  // YYYY-MM sorted
  selectedMonths: string[]
  onChange: (months: string[]) => void
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

export function MonthPills({ availableMonths, selectedMonths, onChange }: MonthPillsProps) {
  const allSelected = selectedMonths.length === 0

  function toggleMonth(ym: string) {
    if (selectedMonths.includes(ym)) {
      const next = selectedMonths.filter((m) => m !== ym)
      onChange(next)
    } else {
      onChange([...selectedMonths, ym])
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      <button
        onClick={() => onChange([])}
        className={cn(
          'px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
          allSelected
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-white text-foreground border-border hover:border-primary/50',
        )}
      >
        Todos
      </button>
      {availableMonths.map((ym) => {
        const active = selectedMonths.includes(ym)
        return (
          <button
            key={ym}
            onClick={() => toggleMonth(ym)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-white text-foreground border-border hover:border-primary/50',
            )}
          >
            {formatMonthLabel(ym)}
          </button>
        )
      })}
    </div>
  )
}
