// Script para rodar coleta manualmente: npm run collect
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { runDailyFetch } from './scheduler'

const prisma = new PrismaClient()

runDailyFetch(prisma)
  .then((count) => {
    console.log(`Coleta manual concluída: ${count} snapshots salvos`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('Erro:', err)
    process.exit(1)
  })
