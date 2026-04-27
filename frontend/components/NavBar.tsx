'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PlaneTakeoff, Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: '📅 Explorar preços' },
  { href: '/planejar', label: '🧭 Planejar viagem' },
  { href: '/dashboard', label: '⚙ Dashboard' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <header className="bg-primary sticky top-0 z-40 h-[50px] flex items-center px-4 justify-between shrink-0">
      <div className="flex items-center gap-2">
        <PlaneTakeoff className="w-5 h-5 text-white" />
        <span className="font-extrabold text-white tracking-tight">FlightSearch</span>
      </div>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'text-sm px-3 py-1.5 rounded-md transition-colors',
              pathname === l.href
                ? 'bg-white/20 text-white font-semibold'
                : 'text-white/70 hover:text-white hover:bg-white/10',
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger
            render={<Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/10" />}
          >
            <Menu className="w-4 h-4 text-white" />
          </SheetTrigger>
          <SheetContent side="right" className="w-56 pt-12">
            <nav className="flex flex-col gap-1 px-2">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    'text-sm px-3 py-2 rounded-md transition-colors',
                    pathname === l.href
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
