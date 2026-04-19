import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Coleta — FlightSearch',
  description: 'Snapshots da última coleta e filtros por rota e data do voo',
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children
}
