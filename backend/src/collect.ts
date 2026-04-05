// Script para rodar coleta manualmente: npm run collect
import fs from 'fs/promises'
import path from 'path'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { runDailyFetch, type DailyFetchReport } from './scheduler'

const prisma = new PrismaClient()

/** Nome de arquivo seguro no Windows (sem ":" em ISO) */
function fileSafeIso(d: Date): string {
  return d.toISOString().replace(/:/g, '-')
}

function formatDailyFetchReport(report: DailyFetchReport): string {
  const lines: string[] = []
  lines.push('=== Relatório do scheduler (runDailyFetch) ===')
  lines.push(`collectedAt: ${report.collectedAtIso}`)
  lines.push(`rotas processadas: ${report.routeCount}`)
  lines.push(`total snapshots inseridos: ${report.totalSaved}`)
  lines.push(`quantidade de avisos coletados: ${report.warnings.length}`)
  lines.push('')
  lines.push('--- Por rota ---')
  for (const r of report.perRoute) {
    lines.push(
      `[id=${r.routeId}] ${r.origin}→${r.destination} (${r.tripType}) | ${r.durationMs}ms`
    )
    lines.push(
      `  SearchAPI: ${r.skipped ? 'pulado (dados recentes — economia de quota)' : `${r.rowsFetched} datas recebidas`}`
    )
    if (r.chunkErrors.length > 0) {
      lines.push(`  SearchAPI erros por intervalo (${r.chunkErrors.length}):`)
      for (const e of r.chunkErrors) {
        lines.push(`    · ${e}`)
      }
    }
    lines.push(
      `  DB insert count: ${r.snapshotsInserted}`
    )
    lines.push('')
  }
  if (report.warnings.length > 0) {
    lines.push('--- Avisos e erros de API (texto completo) ---')
    for (const w of report.warnings) {
      lines.push(`- ${w}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function writeCollectLogFile(opts: {
  ok: boolean
  startedAt: number
  finishedAt: number
  report?: DailyFetchReport
  error?: unknown
}): Promise<string> {
  const dir = path.join(__dirname, '..', 'logs')
  await fs.mkdir(dir, { recursive: true })
  const fileName = `collect-${fileSafeIso(new Date(opts.finishedAt))}.log`
  const filePath = path.join(dir, fileName)

  const parts: string[] = []
  parts.push('[Collect] execução npm run collect')
  parts.push(`status: ${opts.ok ? 'ok' : 'error'}`)
  parts.push(`startedAt: ${new Date(opts.startedAt).toISOString()}`)
  parts.push(`finishedAt: ${new Date(opts.finishedAt).toISOString()}`)
  parts.push(`durationSec: ${((opts.finishedAt - opts.startedAt) / 1000).toFixed(3)}`)

  if (opts.ok && opts.report) {
    parts.push(`snapshots (totalSaved): ${opts.report.totalSaved}`)
    parts.push('')
    parts.push(formatDailyFetchReport(opts.report))
  } else if (opts.ok && !opts.report) {
    parts.push('(relatório detalhado indisponível)')
    parts.push('')
  }

  if (!opts.ok && opts.error !== undefined) {
    parts.push('')
    parts.push('=== Erro fatal (execução abortada) ===')
    const e = opts.error
    parts.push(`message: ${e instanceof Error ? e.message : String(e)}`)
    if (e instanceof Error && e.stack) {
      parts.push('stack:')
      parts.push(e.stack)
    }
  }

  await fs.writeFile(filePath, `${parts.join('\n')}\n`, 'utf8')
  return filePath
}

async function main() {
  const startedAt = Date.now()
  let report: DailyFetchReport | undefined
  let caught: unknown

  console.log(`[Collect] Início ${new Date().toISOString()}`)

  try {
    report = await runDailyFetch(prisma)
    const sec = ((Date.now() - startedAt) / 1000).toFixed(1)
    console.log(
      `[Collect] Fim ${new Date().toISOString()} — ${report.totalSaved} snapshot(s) gravado(s) em ${sec}s | ${report.warnings.length} aviso(s)`
    )
    process.exitCode = 0
  } catch (err: unknown) {
    caught = err
    console.error(`[Collect] Falha após ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
    console.error(err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
    try {
      const finishedAt = Date.now()
      const logPath = await writeCollectLogFile({
        ok: caught === undefined,
        startedAt,
        finishedAt,
        report,
        error: caught,
      })
      console.log(`[Collect] Arquivo de log: ${logPath}`)
    } catch (logErr) {
      console.error('[Collect] Não foi possível gravar o arquivo de log:', logErr)
    }
  }
}

main().then(() => process.exit(process.exitCode ?? 0))
