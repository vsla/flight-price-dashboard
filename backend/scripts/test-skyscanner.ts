/**
 * Script de teste isolado para o Skyscanner scraper.
 * Uso: npx tsx backend/scripts/test-skyscanner.ts
 *
 * Requer SKYSCANNER_ENABLED=true no .env (ou na linha de comando).
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import * as sky from '../src/collectors/skyscanner'

async function main() {
  if (!sky.isConfigured()) {
    console.error('SKYSCANNER_ENABLED não está true. Adicione ao .env e tente novamente.')
    process.exit(1)
  }

  const origin = process.argv[2] ?? 'REC'
  const destination = process.argv[3] ?? 'MAD'
  const yearMonth = process.argv[4] ?? '2026-11'

  console.log(`Testando ${origin} → ${destination} para ${yearMonth}...`)
  console.log(`oym: ${sky.toOym(yearMonth)}\n`)

  const { records, error } = await sky.fetchMonthView(origin, destination, yearMonth)

  if (error) {
    console.error(`Erro: ${error}`)
  }

  console.log(`${records.length} registro(s) coletado(s)`)
  if (records.length > 0) {
    console.log('\nPrimeiros 5:')
    records.slice(0, 5).forEach((r) => {
      const date = r.flightDate.toISOString().slice(0, 10)
      console.log(`  ${date}  R$ ${r.priceBrl}`)
    })

    const prices = records.map((r) => r.priceBrl)
    console.log(`\nMenor preço: R$ ${Math.min(...prices)}`)
    console.log(`Maior preço: R$ ${Math.max(...prices)}`)
  }

  await sky.closeBrowser()
}

main().catch((err) => {
  console.error(err)
  sky.closeBrowser().finally(() => process.exit(1))
})
