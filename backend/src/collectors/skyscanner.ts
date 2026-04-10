/**
 * Skyscanner Month View Scraper
 * Raspa a view de calendário mensal do Skyscanner usando Playwright.
 *
 * Usa o Chrome real instalado na máquina + perfil persistente em ~/.flightsearch-chrome-profile
 * para contornar a detecção de bot do Cloudflare.
 *
 * Primeira execução: rode com SKYSCANNER_HEADED=true para resolver o CAPTCHA manualmente.
 * Após isso, o perfil fica salvo e runs futuras passam automaticamente (headless ou headed).
 *
 * Requer: npm run install:playwright  (só para os tipos — o binário usado é o Chrome real)
 * Ativar: SKYSCANNER_ENABLED=true no .env
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { FlightRecord } from './types'

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

export interface FetchMonthViewResult {
  records: FlightRecord[]
  error?: string
}

interface CellData {
  ariaLabel: string
  disabled: boolean
  isOutside: boolean
}

// ---------------------------------------------------------------------------
// Lookup de meses em português
// ---------------------------------------------------------------------------

const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

// ---------------------------------------------------------------------------
// Parsing puro
// ---------------------------------------------------------------------------

export function toOym(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  return year.slice(2) + month
}

export function parseAriaLabel(label: string): { date: Date; priceBrl: number } | null {
  const match = label.match(
    /^[^,]+,\s*(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})(?:,\s*R\$\s*([\d.]+))?/
  )
  if (!match) return null

  const day = parseInt(match[1], 10)
  const monthName = match[2].toLowerCase()
  const year = parseInt(match[3], 10)
  const priceRaw = match[4]

  const month = PT_MONTHS[monthName]
  if (!month || !priceRaw) return null

  const priceBrl = parseInt(priceRaw.replaceAll('.', ''), 10)
  if (isNaN(priceBrl) || priceBrl <= 0) return null

  const date = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
  )
  return { date, priceBrl }
}

export function parseCalendarCells(cells: CellData[]): FlightRecord[] {
  const records: FlightRecord[] = []
  for (const cell of cells) {
    if (cell.disabled || cell.isOutside) continue
    const parsed = parseAriaLabel(cell.ariaLabel)
    if (!parsed) continue
    records.push({
      flightDate: parsed.date,
      returnDate: null,
      airline: null,
      priceBrl: parsed.priceBrl,
      priceEur: null,
      stops: 0,
      durationMinutes: null,
      source: 'skyscanner',
    })
  }
  return records
}

// ---------------------------------------------------------------------------
// Localização do Chrome real
// ---------------------------------------------------------------------------

function findChrome(): string | undefined {
  const candidates = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]
  // SKYSCANNER_CHROME_PATH permite apontar para outro binário
  if (process.env.SKYSCANNER_CHROME_PATH) return process.env.SKYSCANNER_CHROME_PATH
  return candidates.find((p) => fs.existsSync(p))
}

// ---------------------------------------------------------------------------
// Contexto persistente (singleton)
//
// launchPersistentContext salva cookies/localStorage em disco entre execuções.
// Depois que o usuário resolver o CAPTCHA uma vez (com SKYSCANNER_HEADED=true),
// a sessão fica gravada e as próximas runs passam sem intervenção.
// ---------------------------------------------------------------------------

const PROFILE_DIR = path.join(os.homedir(), '.flightsearch-chrome-profile')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let persistentContext: any = null
let lastUsedAt = 0
const CONTEXT_IDLE_TTL_MS = 10 * 60 * 1000 // 10 minutos

async function getPlaywright() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('playwright')
  } catch {
    return null
  }
}

async function getContext() {
  const pw = await getPlaywright()
  if (!pw) throw new Error('Playwright não instalado. Execute: npm run install:playwright')

  // Fechar contexto ocioso
  if (persistentContext && Date.now() - lastUsedAt > CONTEXT_IDLE_TTL_MS) {
    try { await persistentContext.close() } catch { /* ignorar */ }
    persistentContext = null
  }

  if (!persistentContext) {
    const executablePath = findChrome()
    const headed = process.env.SKYSCANNER_HEADED === 'true'

    if (!executablePath) {
      console.warn(
        '[Skyscanner] Chrome real não encontrado — usando Chromium do Playwright (maior chance de bloqueio).\n' +
        '  Para usar o Chrome real, defina SKYSCANNER_CHROME_PATH=/caminho/para/chrome no .env'
      )
    } else {
      console.log(`[Skyscanner] Usando Chrome: ${executablePath}`)
    }

    persistentContext = await pw.chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath,
      headless: !headed,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      viewport: { width: 1366, height: 768 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
    })

    await persistentContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
  }

  lastUsedAt = Date.now()
  return persistentContext
}

export async function closeBrowser(): Promise<void> {
  if (persistentContext) {
    try { await persistentContext.close() } catch { /* ignorar */ }
    persistentContext = null
  }
}

// ---------------------------------------------------------------------------
// isConfigured
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return process.env.SKYSCANNER_ENABLED === 'true'
}

// ---------------------------------------------------------------------------
// Detecção de CAPTCHA (pode aparecer a qualquer momento, não só no goto)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isCaptchaPresent(page: any): Promise<boolean> {
  try {
    const title: string = await page.title()
    if (title.includes('Just a moment') || title.includes('Checking')) return true
    if (title.includes('Access denied')) return true
    if (!page.url().includes('skyscanner')) return true
    // Indicadores de CAPTCHA no DOM (Cloudflare Turnstile, hCaptcha, challenge genérico)
    const selectors = [
      'iframe[src*="captcha"]',
      'iframe[src*="challenges.cloudflare.com"]',
      '.cf-turnstile',
      '#challenge-running',
      '#challenge-stage',
      '[data-sitekey]',
    ]
    for (const sel of selectors) {
      const el = await page.$(sel)
      if (el) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Aguarda as células do calendário com polling a cada 2s.
 * Detecta CAPTCHA a qualquer momento e:
 *  - headed: toca bell no terminal, aguarda o usuário resolver (até CAPTCHA_WAIT_MS)
 *  - headless: lança erro imediatamente
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForCalendar(page: any, label: string): Promise<void> {
  const headed = process.env.SKYSCANNER_HEADED === 'true'
  const POLL_MS = 2000
  const MAX_WAIT_MS = headed ? 5 * 60 * 1000 : 60 * 1000   // 5 min headed | 60s headless
  const CAPTCHA_WAIT_MS = 5 * 60 * 1000                     // até 5 min para resolver CAPTCHA

  const started = Date.now()
  let captchaWarned = false
  let captchaDetectedAt = 0

  while (true) {
    // Verificar se as células já apareceram
    try {
      const cells = await page.$$('button.month-view-calendar__cell')
      const validCells = cells.filter ? cells : Array.from(cells)
      // Precisa de pelo menos uma célula do mês (não disabled/outside)
      const hasCells = validCells.length > 0
      if (hasCells) return
    } catch {
      throw new Error('contexto fechado')
    }

    // Verificar CAPTCHA
    const captcha = await isCaptchaPresent(page)
    if (captcha) {
      if (!captchaWarned) {
        captchaWarned = true
        captchaDetectedAt = Date.now()
        process.stdout.write('\x07') // bell — aviso sonoro no terminal
        console.warn(
          `\n[Skyscanner] ⚠️  CAPTCHA detectado (${label})` +
          (headed
            ? ' — resolva no browser, aguardando até 5 min...'
            : ' — rode com SKYSCANNER_HEADED=true para resolver manualmente')
        )
        if (!headed) throw new Error('captcha')
      }
      // Em headed: verificar timeout do CAPTCHA
      if (Date.now() - captchaDetectedAt > CAPTCHA_WAIT_MS) {
        throw new Error('captcha-timeout')
      }
    } else if (captchaWarned) {
      // CAPTCHA foi resolvido — resetar contador geral e continuar esperando células
      console.log(`[Skyscanner] CAPTCHA resolvido, aguardando calendário...`)
      captchaWarned = false
    }

    // Timeout geral (sem CAPTCHA pendente)
    if (!captchaWarned && Date.now() - started > MAX_WAIT_MS) {
      throw new Error(`timeout esperando calendário (${label})`)
    }

    await new Promise((res) => setTimeout(res, POLL_MS))
  }
}

// ---------------------------------------------------------------------------
// fetchMonthView
// ---------------------------------------------------------------------------

export async function fetchMonthView(
  origin: string,
  destination: string,
  yearMonth: string
): Promise<FetchMonthViewResult> {
  if (!isConfigured()) return { records: [] }

  const oym = toOym(yearMonth)
  const url =
    `https://www.skyscanner.com.br/transporte/passagens-aereas/` +
    `${origin.toLowerCase()}/${destination.toLowerCase()}/` +
    `?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0` +
    `&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false` +
    `&oym=${oym}&selectedoday=01`

  const label = `${origin}→${destination} ${yearMonth}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any = null

  try {
    // Se o contexto morreu (ex: crash após timeout anterior), reinicializar
    if (persistentContext) {
      try { await persistentContext.pages() } catch {
        console.warn('[Skyscanner] Contexto inválido, reinicializando...')
        persistentContext = null
      }
    }

    const context = await getContext()
    page = await context.newPage()

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // Aguardar calendário com detecção de CAPTCHA contínua
    await waitForCalendar(page, label)

    const cells: CellData[] = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button.month-view-calendar__cell')
      return Array.from(buttons).map((btn) => ({
        ariaLabel: btn.getAttribute('aria-label') ?? '',
        disabled: btn.hasAttribute('disabled'),
        isOutside: btn.classList.contains('month-view-calendar__cell--outside'),
      }))
    })

    const records = parseCalendarCells(cells)
    return { records }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Contexto morreu (crash, fechamento inesperado) — forçar reinicialização
    if (
      msg.includes('Target page') ||
      msg.includes('browser has been closed') ||
      msg.includes('context or browser') ||
      msg.includes('contexto fechado')
    ) {
      console.warn('[Skyscanner] Contexto fechado inesperadamente, reinicializando na próxima chamada')
      persistentContext = null
    }
    console.error(`[Skyscanner] Erro ${label}: ${msg}`)
    return { records: [], error: msg }
  } finally {
    try { await page?.close() } catch { /* ignorar */ }
    lastUsedAt = Date.now()
  }
}
