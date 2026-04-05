// Apaga todos os registros de price_snapshots. Rotas e alertas permanecem.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const result = await prisma.priceSnapshot.deleteMany({})
  console.log(`Snapshots removidos: ${result.count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
